package com.godsaeng.app

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseRouteResult
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToLong
import kotlin.math.sin
import kotlin.math.sqrt

// 워치 자동 올리기: 15분마다 Health Connect 에서 새 운동(켠 뒤 끝난 것)을 읽어 auto_upload(기기 열쇠)로 올리고 휴대폰 알림
// 설정은 AutoSyncPlugin 이 SharedPreferences("autosync")에 넣어 둠. 서버 쪽 확인·심박/경로 동의는 supabase/016
class SyncWorker(ctx: Context, params: WorkerParameters) : CoroutineWorker(ctx, params) {
    override suspend fun doWork(): Result {
        val p = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val url = p.getString("url", null) ?: return Result.success()
        val anon = p.getString("anon", null) ?: return Result.success()
        val dkey = p.getString("dkey", null) ?: return Result.success()
        if (HealthConnectClient.getSdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) return Result.success()
        val hc = HealthConnectClient.getOrCreate(applicationContext)
        val since = Instant.ofEpochMilli(p.getLong("since", System.currentTimeMillis()))
        val done = JSONArray(p.getString("done", "[]"))
        val doneIds = (0 until done.length()).map { done.getString(it) }.toMutableList()
        val sessions = try {
            hc.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.after(since))).records
        } catch (e: Exception) { return Result.success() }   // 권한 없음 등: 다음에 다시
        var newest = since
        for (s in sessions) {
            val id = s.metadata.id
            if (id in doneIds || s.endTime.isAfter(Instant.now())) continue
            val sec = s.endTime.epochSecond - s.startTime.epochSecond
            if (sec < 60) { doneIds.add(id); continue }
            val agg = try {
                hc.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL, TotalCaloriesBurnedRecord.ENERGY_TOTAL, HeartRateRecord.BPM_AVG),
                    TimeRangeFilter.between(s.startTime, s.endTime)))
            } catch (e: Exception) { null }
            val km = (agg?.get(DistanceRecord.DISTANCE_TOTAL)?.inMeters ?: 0.0) / 1000
            val type = TYPES[s.exerciseType] ?: "etc"
            val w = JSONObject()
                .put("ext_id", id).put("type", type).put("started_at", s.startTime.toString())
                .put("duration_min", sec / 60.0).put("distance_km", km)
                .put("kcal", agg?.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL)?.inKilocalories ?: 0.0)
            agg?.get(HeartRateRecord.BPM_AVG)?.let { w.put("avg_hr", it) }
            val route = (s.exerciseRouteResult as? ExerciseRouteResult.Data)?.exerciseRoute?.route
                ?.map { doubleArrayOf(it.latitude, it.longitude) }?.let { encode(slim(trim(it))) }?.takeIf { it.isNotEmpty() }
            val wid = upload(url, anon, dkey, w, route) ?: return Result.retry()
            doneIds.add(id)
            notify(wid, LABELS[type] ?: "운동", km, sec)
            val up = JSONArray(p.getString("uploaded", "[]")).put(wid)
            p.edit().putString("uploaded", up.toString()).apply()
            if (s.endTime.isAfter(newest)) newest = s.endTime
        }
        p.edit().putString("done", JSONArray(doneIds.takeLast(300)).toString()).putLong("since", maxOf(since, newest.minusSeconds(6 * 3600)).toEpochMilli()).apply()
        return Result.success()
    }

    private fun upload(url: String, anon: String, dkey: String, w: JSONObject, route: String?): String? = try {
        val c = URL("$url/rest/v1/rpc/auto_upload").openConnection() as HttpURLConnection
        c.requestMethod = "POST"; c.doOutput = true; c.connectTimeout = 15000; c.readTimeout = 15000
        c.setRequestProperty("apikey", anon); c.setRequestProperty("Authorization", "Bearer $anon"); c.setRequestProperty("Content-Type", "application/json")
        c.outputStream.use { it.write(JSONObject().put("dkey", dkey).put("w", w).put("route", route ?: JSONObject.NULL).toString().toByteArray()) }
        if (c.responseCode in 200..299) c.inputStream.bufferedReader().readText().trim().trim('"') else null
    } catch (e: Exception) { null }

    // 알림: "러닝 5.20km · 32분 올렸어요" → 누르면 그 기록 수정 화면(MainActivity 가 wid 를 앱에 넘김)
    private fun notify(wid: String, label: String, km: Double, sec: Long) {
        val ctx = applicationContext
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
                NotificationChannel(CHANNEL, "워치 자동 올리기", NotificationManager.IMPORTANCE_DEFAULT))
        }
        val open = Intent(ctx, MainActivity::class.java).putExtra("wid", wid).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val pi = PendingIntent.getActivity(ctx, wid.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val what = (if (km > 0.05) "%.2fkm · ".format(km) else "") + "${sec / 60}분"
        val n = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle("$label 기록 올리기 성공!").setContentText("$what · 눌러서 사진·한마디 추가하기")
            .setContentIntent(pi).setAutoCancel(true).build()
        try { NotificationManagerCompat.from(ctx).notify(wid.hashCode(), n) } catch (e: SecurityException) { /* 알림 권한 없음 */ }
    }

    companion object {
        const val PREFS = "autosync"
        const val CHANNEL = "autosync"
        // Health Connect 운동 종류 → 앱 종목(src/screens/watch.js 와 같게)
        val TYPES = mapOf(
            ExerciseSessionRecord.EXERCISE_TYPE_RUNNING to "run", ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL to "vrun",
            ExerciseSessionRecord.EXERCISE_TYPE_WALKING to "walk", ExerciseSessionRecord.EXERCISE_TYPE_HIKING to "hike",
            ExerciseSessionRecord.EXERCISE_TYPE_WHEELCHAIR to "wheelchair", ExerciseSessionRecord.EXERCISE_TYPE_BIKING to "ride",
            ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY to "vride", ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL to "swim",
            ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER to "swim", ExerciseSessionRecord.EXERCISE_TYPE_ROWING to "rowing",
            ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE to "vrow", ExerciseSessionRecord.EXERCISE_TYPE_PADDLING to "kayak",
            ExerciseSessionRecord.EXERCISE_TYPE_SAILING to "sail", ExerciseSessionRecord.EXERCISE_TYPE_SURFING to "surf",
            ExerciseSessionRecord.EXERCISE_TYPE_SKIING to "alpine", ExerciseSessionRecord.EXERCISE_TYPE_SNOWBOARDING to "snowboard",
            ExerciseSessionRecord.EXERCISE_TYPE_SNOWSHOEING to "snowshoe", ExerciseSessionRecord.EXERCISE_TYPE_ICE_SKATING to "iceskate",
            ExerciseSessionRecord.EXERCISE_TYPE_SKATING to "inline", ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING to "gym",
            ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING to "gym", ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS to "home",
            ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING to "hiit", ExerciseSessionRecord.EXERCISE_TYPE_BOOT_CAMP to "hiit",
            ExerciseSessionRecord.EXERCISE_TYPE_EXERCISE_CLASS to "home", ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING to "home",
            ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL to "elliptical", ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING to "stair",
            ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE to "stair", ExerciseSessionRecord.EXERCISE_TYPE_PILATES to "pilates",
            ExerciseSessionRecord.EXERCISE_TYPE_YOGA to "yoga", ExerciseSessionRecord.EXERCISE_TYPE_DANCING to "dance",
            ExerciseSessionRecord.EXERCISE_TYPE_ROCK_CLIMBING to "climbing", ExerciseSessionRecord.EXERCISE_TYPE_BOXING to "boxing",
            ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS to "martial", ExerciseSessionRecord.EXERCISE_TYPE_TENNIS to "tennis",
            ExerciseSessionRecord.EXERCISE_TYPE_BADMINTON to "badminton", ExerciseSessionRecord.EXERCISE_TYPE_TABLE_TENNIS to "tabletennis",
            ExerciseSessionRecord.EXERCISE_TYPE_SQUASH to "squash", ExerciseSessionRecord.EXERCISE_TYPE_RACQUETBALL to "racquetball",
            ExerciseSessionRecord.EXERCISE_TYPE_SOCCER to "soccer", ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL to "basketball",
            ExerciseSessionRecord.EXERCISE_TYPE_VOLLEYBALL to "volleyball", ExerciseSessionRecord.EXERCISE_TYPE_BASEBALL to "baseball",
            ExerciseSessionRecord.EXERCISE_TYPE_SOFTBALL to "baseball", ExerciseSessionRecord.EXERCISE_TYPE_CRICKET to "cricket",
            ExerciseSessionRecord.EXERCISE_TYPE_GOLF to "golf")
        val LABELS = mapOf("run" to "러닝", "vrun" to "러닝머신", "walk" to "걷기", "hike" to "등산", "ride" to "자전거", "vride" to "실내 자전거",
            "swim" to "수영", "gym" to "웨이트", "hiit" to "HIIT", "yoga" to "요가", "pilates" to "필라테스", "tennis" to "테니스",
            "badminton" to "배드민턴", "soccer" to "축구", "basketball" to "농구", "golf" to "골프", "climbing" to "클라이밍", "boxing" to "복싱")

        // 경로: 출발·도착 200m 자르기 → 10m 간격·최대 1,000점 → encoded polyline (src/lib/gps.js 의 trim·slim·encodePoly 와 같음)
        private fun dist(a: DoubleArray, b: DoubleArray): Double {
            val r = Math.PI / 180
            val x = sin((b[0] - a[0]) * r / 2).pow(2) + cos(a[0] * r) * cos(b[0] * r) * sin((b[1] - a[1]) * r / 2).pow(2)
            return 2 * 6371e3 * asin(sqrt(x))
        }
        fun trim(pts: List<DoubleArray>): List<DoubleArray> {
            if (pts.size < 2) return emptyList()
            val s = pts.first(); val e = pts.last()
            return pts.filter { dist(it, s) > 200 && dist(it, e) > 200 }
        }
        fun slim(pts: List<DoubleArray>): List<DoubleArray> {
            val out = mutableListOf<DoubleArray>()
            for (p in pts) if (out.isEmpty() || dist(out.last(), p) >= 10) out.add(p)
            val step = (out.size + 999) / 1000
            return if (step > 1) out.filterIndexed { i, _ -> i % step == 0 || i == out.size - 1 } else out
        }
        fun encode(pts: List<DoubleArray>): String {
            if (pts.size < 2) return ""
            val sb = StringBuilder(); var la = 0L; var ln = 0L
            fun enc(v0: Long) { var v = if (v0 < 0) (v0 shl 1).inv() else v0 shl 1; while (v >= 0x20) { sb.append(((0x20L or (v and 0x1f)) + 63).toInt().toChar()); v = v shr 5 }; sb.append((v + 63).toInt().toChar()) }
            for (p in pts) { val a = (p[0] * 1e5).roundToLong(); val b = (p[1] * 1e5).roundToLong(); enc(a - la); enc(b - ln); la = a; ln = b }
            return sb.toString()
        }
    }
}
