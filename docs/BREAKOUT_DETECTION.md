# Breakout detection

Breakout detection is a separate rule engine. It is not a percentage-growth shortcut.

The engine evaluates relative lift, absolute lift, live ratio where available, duration, data confidence, freshness, valid-traffic status, and traffic-quality health. Entry requires both relative and absolute evidence plus persistence across multiple evaluation windows. Missing live support does not invent a live signal.

States are `none`, `watch`, `breaking_out`, `surging`, `cooling`, `resolved`, and `invalidated`. Entry and exit thresholds differ. Resolution writes a cooldown window so a repeated threshold crossing cannot create repeated public activity spam.

Every event stores rule version, detection/active/resolution times, baseline/current/lift metrics, confidence, explanation, peak metrics, and state transitions. Public activity is emitted only on state changes and never for a fraud-review or invalid-traffic signal.

Explanations describe observed evidence, for example: “Traffic is 4.2× above the expected level with additional valid visitors.” The system does not infer social, news, Reddit, TikTok, or creator causes without actual attribution.
