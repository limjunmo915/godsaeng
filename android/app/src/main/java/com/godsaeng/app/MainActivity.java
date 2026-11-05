package com.godsaeng.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AutoSyncPlugin.class);   // 워치 자동 올리기(앱 안 플러그인)
        super.onCreate(savedInstanceState);
        keepTap(getIntent());
    }

    // '기록 올리기 성공' 알림을 누르고 들어오면 그 기록 id 를 앱(JS)이 AutoSync.take() 로 가져가 수정 화면을 엶
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keepTap(intent);
    }

    private void keepTap(Intent intent) {
        String wid = intent == null ? null : intent.getStringExtra("wid");
        if (wid != null) getSharedPreferences(SyncWorker.PREFS, Context.MODE_PRIVATE).edit().putString("tap", wid).apply();
    }

    // 화면이 꺼져도 웹 화면(JS)이 얼지 않게: 기본값은 안 보이면 우선순위를 낮춰서
    // 안드로이드가 멈춰 버림 → GPS 점을 못 받아 경로가 직선이 됨
    @Override
    public void onStart() {
        super.onStart();
        WebView w = getBridge() == null ? null : getBridge().getWebView();
        if (w != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            w.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
    }
}
