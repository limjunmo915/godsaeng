package com.godsaeng.app;

import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
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
