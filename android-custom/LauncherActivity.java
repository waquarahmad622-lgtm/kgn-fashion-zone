package io.github.waquarahmad622_lgtm.kgnfashionzone;

import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import androidx.browser.customtabs.CustomTabsCallback;
import androidx.browser.customtabs.CustomTabsService;
import androidx.browser.customtabs.CustomTabsSession;
import androidx.browser.trusted.TrustedWebActivityIntentBuilder;
import com.google.androidbrowserhelper.trusted.QualityEnforcer;
import com.google.androidbrowserhelper.trusted.TwaLauncher;
import com.google.androidbrowserhelper.trusted.splashscreens.SplashScreenStrategy;

/** Keep the branded splash visible while Chrome validates this app and origin. */
public class LauncherActivity extends com.google.androidbrowserhelper.trusted.LauncherActivity {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private Runnable pendingLaunch;
    private Uri pendingOrigin;
    private final Runnable validationTimeout = this::finishValidation;

    @Override
    protected CustomTabsCallback getCustomTabsCallback() {
        return new QualityEnforcer() {
            @Override
            public void onRelationshipValidationResult(int relation, Uri origin,
                    boolean result, Bundle extras) {
                super.onRelationshipValidationResult(relation, origin, result, extras);
                if (relation == CustomTabsService.RELATION_HANDLE_ALL_URLS
                        && origin != null && origin.equals(pendingOrigin)) {
                    handler.post(LauncherActivity.this::finishValidation);
                }
            }
        };
    }

    @Override
    protected TwaLauncher createTwaLauncher() {
        return new TwaLauncher(this) {
            @Override
            public void launch(TrustedWebActivityIntentBuilder builder, CustomTabsCallback callback,
                    SplashScreenStrategy splash, Runnable completed, FallbackStrategy fallback) {
                SplashScreenStrategy verifiedSplash = new SplashScreenStrategy() {
                    @Override
                    public void onTwaLaunchInitiated(String provider,
                            TrustedWebActivityIntentBuilder intentBuilder) {
                        if (splash != null) splash.onTwaLaunchInitiated(provider, intentBuilder);
                    }

                    @Override
                    public void configureTwaBuilder(TrustedWebActivityIntentBuilder intentBuilder,
                            CustomTabsSession session, Runnable ready) {
                        Runnable validate = () -> {
                            if (isFinishing() || isDestroyed()) return;
                            Uri url = intentBuilder.getUri();
                            pendingOrigin = new Uri.Builder().scheme(url.getScheme())
                                    .authority(url.getAuthority()).build();
                            pendingLaunch = ready;
                            // A failure or timeout preserves Chrome's normal, visible fallback.
                            // Never disable validation or hide an unverified origin's toolbar.
                            handler.postDelayed(validationTimeout, 4000);
                            if (!session.validateRelationship(CustomTabsService.RELATION_HANDLE_ALL_URLS,
                                    pendingOrigin, null)) finishValidation();
                        };
                        if (splash != null) splash.configureTwaBuilder(intentBuilder, session, validate);
                        else validate.run();
                    }
                };
                super.launch(builder, callback, verifiedSplash, completed, fallback);
            }
        };
    }

    private void finishValidation() {
        handler.removeCallbacks(validationTimeout);
        Runnable ready = pendingLaunch;
        pendingLaunch = null;
        pendingOrigin = null;
        if (ready != null && !isFinishing() && !isDestroyed()) ready.run();
    }

    @Override
    protected Uri getLaunchingUrl() {
        Uri expected = Uri.parse(getString(R.string.launchUrl));
        Uri requested = super.getLaunchingUrl();
        if (requested == null || !"https".equals(requested.getScheme())
                || !expected.getAuthority().equals(requested.getAuthority())) return expected;
        String path = requested.getPath();
        // Customer and Admin shortcuts must not redirect into each other's entry point.
        if (expected.getPath().equals(path)) return requested;
        if (expected.getPath().endsWith("/index.html") &&
                ("/kgn-fashion-zone/".equals(path)
                || "/kgn-fashion-zone/privacy-policy.html".equals(path)
                || "/kgn-fashion-zone/order-privacy.html".equals(path))) return requested;
        return expected;
    }

    @Override
    protected void onDestroy() {
        pendingLaunch = null;
        pendingOrigin = null;
        handler.removeCallbacksAndMessages(null);
        super.onDestroy();
    }
}
