<?php
/**
 * Plugin Name: HiGuppy SurgeIndex Tracker
 * Description: Consent-gated ownership proof and first-party SurgeIndex telemetry for higuppy.com.
 * Version: 1.2.0
 *
 * @package Higuppy
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Print a short-lived ownership challenge when one is configured.
 */
function higuppy_surgeindex_print_verification(): void {
	$token = trim( (string) get_option( 'surgeindex_verification_token', '' ) );
	if ( ! preg_match( '/\A[a-f0-9]{64}\z/', $token ) ) {
		return;
	}

	printf(
		"\n<meta name=\"surgeindex-verification\" content=\"%s\" />\n",
		esc_attr( $token )
	);
}
add_action( 'wp_head', 'higuppy_surgeindex_print_verification', 2 );

/**
 * Keep the tracker entirely off WooCommerce and account flows.
 *
 * This is intentionally a server-side gate. The browser must not download
 * the tracker on pages whose paths or query strings may contain order,
 * customer, account, password-reset, or checkout identifiers.
 */
function higuppy_surgeindex_is_sensitive_route(): bool {
	if ( function_exists( 'is_admin' ) && is_admin() ) {
		return true;
	}

	foreach ( array( 'is_account_page', 'is_checkout', 'is_order_received_page', 'is_lost_password_page' ) as $conditional ) {
		if ( function_exists( $conditional ) && $conditional() ) {
			return true;
		}
	}

	if ( function_exists( 'is_wc_endpoint_url' ) ) {
		foreach ( array( 'view-order', 'edit-account', 'edit-address', 'orders', 'downloads', 'payment-methods', 'add-payment-method', 'delete-payment-method', 'set-default-payment-method', 'customer-logout', 'lost-password', 'password-reset', 'order-pay', 'order-received' ) as $endpoint ) {
			if ( is_wc_endpoint_url( $endpoint ) ) {
				return true;
			}
		}
	}

	$request_uri = isset( $_SERVER['REQUEST_URI'] ) ? (string) wp_unslash( $_SERVER['REQUEST_URI'] ) : '';
	$path        = wp_parse_url( $request_uri, PHP_URL_PATH );
	$path        = is_string( $path ) ? strtolower( (string) preg_replace( '#/+#', '/', $path ) ) : '';
	$segments    = array_values( array_filter( explode( '/', trim( $path, '/' ) ), 'strlen' ) );
	$blocked_segments = array(
		'account',
		'checkout',
		'customer-logout',
		'forgot-password',
		'lost-password',
		'my-account',
		'order-pay',
		'order-received',
		'password-reset',
		'reset-password',
		'view-order',
	);
	foreach ( $segments as $segment ) {
		if ( in_array( $segment, $blocked_segments, true ) ) {
			return true;
		}
	}

	$query = wp_parse_url( $request_uri, PHP_URL_QUERY );
	if ( is_string( $query ) && '' !== $query ) {
		$query_vars = array();
		parse_str( $query, $query_vars );
		$blocked_query_keys = array( 'add-to-cart', 'key', 'order-pay', 'reset-key', 'wc-ajax' );
		foreach ( array_keys( $query_vars ) as $query_key ) {
			if ( in_array( strtolower( (string) $query_key ), $blocked_query_keys, true ) ) {
				return true;
			}
		}
	}

	return false;
}

/**
 * Load SurgeIndex only after the existing HiGuppy analytics consent is granted.
 *
 * The tracker receives anonymous event IDs, pathname, referrer hostname,
 * timestamps, visibility, and engagement timing. It does not receive form
 * values, page text, customer details, cart contents, or full URLs.
 */
function higuppy_surgeindex_print_tracker(): void {
	if ( is_admin() || wp_doing_ajax() || wp_doing_cron() || higuppy_surgeindex_is_sensitive_route() ) {
		return;
	}

	$site_key = trim( (string) get_option( 'surgeindex_site_key', '' ) );
	if ( ! preg_match( '/\Apk_live_[A-Za-z0-9_-]{32}\z/', $site_key ) ) {
		return;
	}

	$config = wp_json_encode(
		array(
			'siteKey'   => $site_key,
			'scriptUrl' => 'https://surgeindex.lol/tracker.js',
			'collector' => 'https://surgeindex.lol/api/collect/v1/events',
		),
		JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE
	);
	if ( false === $config ) {
		return;
	}
	?>
	<script id="higuppy-surgeindex-consent-bridge">
	(function (window, document) {
		'use strict';

		var config = <?php echo $config; // phpcs:ignore WordPress.Security.EscapeOutput.OutputNotEscaped ?>;
		var storage;
		var api = null;
		var wrappedApi = null;
		var loading = false;
		var consentPollTimer = null;
		var lastConsent = '__unknown__';

		try {
			storage = window.localStorage;
		} catch (error) {
			storage = null;
		}

		function setStorage(key, value) {
			if (!storage) {
				return;
			}
			try {
				if (value === null) {
					storage.removeItem(key);
				} else {
					storage.setItem(key, value);
				}
			} catch (error) {
				// Keep the in-memory consent state when storage is unavailable.
			}
		}

		function readHiGuppyConsent() {
			if (!storage) {
				return null;
			}
			try {
				var value = storage.getItem('higuppy_analytics_consent');
				return value === 'granted' || value === 'denied' ? value : null;
			} catch (error) {
				return null;
			}
		}

		function loadTracker() {
			if (loading || window.__surgeindexTracker) {
				return;
			}
			loading = true;
			var script = document.createElement('script');
			script.src = config.scriptUrl;
			script.defer = true;
			script.dataset.site = config.siteKey;
			script.dataset.collector = config.collector;
			script.dataset.consentRequired = 'true';
			script.dataset.consent = 'granted';
			script.onerror = function () { loading = false; };
			document.head.appendChild(script);
		}

		function grant() {
			setStorage('si_opt_out', null);
			setStorage('si_consent', 'granted');
			if (window.__surgeindexTracker && typeof window.__surgeindexTracker.grantConsent === 'function') {
				window.__surgeindexTracker.grantConsent();
				return;
			}
			loadTracker();
		}

		function deny() {
			setStorage('si_consent', null);
			setStorage('si_opt_out', '1');
			if (window.__surgeindexTracker && typeof window.__surgeindexTracker.optOut === 'function') {
				window.__surgeindexTracker.optOut();
			}
		}

		function wrap(name, after) {
			if (!api || typeof api[name] !== 'function') {
				return;
			}
			var original = api[name];
			api[name] = function () {
				var result = original.apply(this, arguments);
				after();
				return result;
			};
		}

		/**
		 * The GA4 consent bootstrap is inline today, but WordPress/plugin order
		 * or a cached page can still expose its API after this bridge runs.
		 * Fail closed first, then attach to the real API as soon as it exists.
		 * The consent dialog calls its private grantConsent/denyConsent helpers,
		 * so the storage key is also watched to catch those UI actions reliably.
		 */
		function attachToConsentApi() {
			var candidate = window.higuppyGa4;
			if (!candidate || typeof candidate !== 'object') {
				return false;
			}
			if (wrappedApi === candidate) {
				return true;
			}

			api = candidate;
			wrappedApi = candidate;
			wrap('grant', grant);
			wrap('deny', deny);
			wrap('reset', deny);
			return true;
		}

		function syncConsent() {
			var consent = readHiGuppyConsent();
			if (consent === null && api && typeof api.getConsent === 'function' && api.getConsent() === 'granted') {
				consent = 'granted';
			}
			if (consent === lastConsent) {
				return;
			}
			lastConsent = consent;
			if (consent === 'granted') {
				grant();
			} else {
				deny();
			}
		}

		deny();
		function pollConsentState() {
			attachToConsentApi();
			syncConsent();
		}
		pollConsentState();
		consentPollTimer = window.setInterval(pollConsentState, 250);
	})(window, document);
	</script>
	<?php
}
add_action( 'wp_head', 'higuppy_surgeindex_print_tracker', 3 );
