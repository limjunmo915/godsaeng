package com.godsaeng.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AutoSyncPlugin.class);   // 워치 자동 올리기(앱 안 플러그인)
        super.onCreate(savedInstanceState);
        keepTap(getIntent());
        // 화면 가장자리: 웹 화면을 상태 표시줄(위)·버튼 줄(아래)·키보드 '안쪽'에만 그림 → 기기·WebView 버전과 상관없이 안 겹침
        // (웹이 여백 값을 받아 스스로 비키는 방식은 폰마다 0 이 와서 겹쳤음. capacitor.config 의 SystemBars insetsHandling: disable 과 짝)
        // 비켜난 자리는 테마의 windowBackground(잉크 #141A0B)가 칠해짐
        View root = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(root, (v, insets) -> {
            Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
            Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
            v.setPadding(bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom));
            return WindowInsetsCompat.CONSUMED;
        });

        // 화면 폭 고정: 폰의 '글자 크기' 설정이 웹 화면 글자를 키우면 몇 줄이 폭을 넘어 앱 전체가 살짝 확대된 채
        // 좌우로 밀리고 오른쪽·아래가 잘렸음 → 글자는 앱 디자인 크기(100%)로, 확대 끄고, 옆으로 밀리면 바로 제자리
        // (사진 크게 보기의 확대는 웹 안에서 따로 함, photo.js)
        WebView web = getBridge().getWebView();
        WebSettings ws = web.getSettings();
        ws.setTextZoom(100);
        ws.setUseWideViewPort(true);        // index.html 의 viewport(width=device-width, 확대 금지)를 따르게
        ws.setLoadWithOverviewMode(true);   // 시작할 때 화면 폭에 딱 맞춤(확대된 채로 시작하지 않게)
        ws.setSupportZoom(false);
        ws.setBuiltInZoomControls(false);
        ws.setDisplayZoomControls(false);
        web.setHorizontalScrollBarEnabled(false);
        web.setOnScrollChangeListener((v, x, y, ox, oy) -> { if (x != 0) v.scrollTo(0, y); });
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
