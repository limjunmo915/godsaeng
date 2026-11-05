package com.godsaeng.app

import android.Manifest
import android.content.Context
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import org.json.JSONArray
import java.util.concurrent.TimeUnit

// 앱(JS)과 SyncWorker 사이 다리: 켜기·끄기, Health Connect 백그라운드 읽기 권한, 알림 권한,
// 알림을 눌러 들어온 기록·자동으로 올라간 기록 넘겨주기
@CapacitorPlugin(name = "AutoSync", permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])])
class AutoSyncPlugin : Plugin() {
    private val prefs get() = context.getSharedPreferences(SyncWorker.PREFS, Context.MODE_PRIVATE)
    private val contract = PermissionController.createRequestPermissionResultContract()

    @PluginMethod
    fun enable(call: PluginCall) {
        val e = prefs.edit().putString("url", call.getString("url")).putString("anon", call.getString("anon")).putString("dkey", call.getString("dkey"))
        if (!prefs.contains("since")) e.putLong("since", System.currentTimeMillis())   // 켠 뒤 끝난 운동만
        e.apply()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<SyncWorker>(15, TimeUnit.MINUTES).build())
        call.resolve()
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
        prefs.edit().remove("dkey").remove("since").apply()
        call.resolve()
    }

    // 지금 한 번 확인(앱을 열 때 등)
    @PluginMethod
    fun runNow(call: PluginCall) {
        if (prefs.getString("dkey", null) != null)
            WorkManager.getInstance(context).enqueueUniqueWork(WORK + "-now", ExistingWorkPolicy.KEEP, OneTimeWorkRequestBuilder<SyncWorker>().build())
        call.resolve()
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val ret = JSObject().put("enabled", prefs.getString("dkey", null) != null)
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) { call.resolve(ret.put("background", false)); return }
        CoroutineScope(Dispatchers.IO).launch {
            val granted = try { HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions() } catch (e: Exception) { emptySet() }
            call.resolve(ret.put("background", BACKGROUND in granted))
        }
    }

    // Health Connect 권한(운동·거리·칼로리·심박·경로 + 앱이 꺼져 있을 때 읽기) 요청 화면
    @PluginMethod
    fun requestBackground(call: PluginCall) {
        if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) { call.reject("Health Connect 없음"); return }
        startActivityForResult(call, contract.createIntent(context, PERMS), "bgResult")
    }

    @ActivityCallback
    private fun bgResult(call: PluginCall, result: ActivityResult) {
        val granted = contract.parseResult(result.resultCode, result.data)
        call.resolve(JSObject().put("background", BACKGROUND in granted))
    }

    @PluginMethod
    fun requestNotifications(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) { call.resolve(JSObject().put("granted", true)); return }
        requestPermissionForAlias("notifications", call, "notifResult")
    }

    @PermissionCallback
    private fun notifResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState("notifications") == PermissionState.GRANTED))
    }

    // 알림을 눌러 들어온 기록 id(tap)와 자동으로 올라간 기록 id 들(uploaded)을 넘기고 비움
    @PluginMethod
    fun take(call: PluginCall) {
        val up = JSONArray(prefs.getString("uploaded", "[]"))
        val ret = JSObject().put("tap", prefs.getString("tap", null)).put("uploaded", JSArray(up.toString()))
        prefs.edit().remove("tap").putString("uploaded", "[]").apply()
        call.resolve(ret)
    }

    companion object {
        const val WORK = "watch-autosync"
        const val BACKGROUND = "android.permission.health.READ_HEALTH_DATA_IN_BACKGROUND"
        val PERMS = setOf("android.permission.health.READ_EXERCISE", "android.permission.health.READ_DISTANCE",
            "android.permission.health.READ_TOTAL_CALORIES_BURNED", "android.permission.health.READ_HEART_RATE",
            "android.permission.health.READ_EXERCISE_ROUTES", BACKGROUND)
    }
}
