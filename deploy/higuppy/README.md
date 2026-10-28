# HiGuppy SurgeIndex integration

`surgeindex-tracker.php` is a narrowly scoped must-use WordPress plugin for
`higuppy.com`. It keeps SurgeIndex outside the dirty child-theme and custom
plugin worktrees, and it emits nothing until one of these protected WordPress
options is present:

- `surgeindex_verification_token`: the current 64-character ownership token.
- `surgeindex_site_key`: the 32-character suffix `pk_live_...` public tracker key.

Deploy it as `/www/wwwroot/higuppy.com/wp-content/mu-plugins/surgeindex-tracker.php`
with owner `www:www` and mode `0644`. Before replacement, preserve the remote
file (if any), verify the expected pre-change hash, lint with the PHP 8.3 CLI,
purge the WordPress/FastCGI cache, and compare the remote SHA-256 with this
source.

The integration reads the existing `window.higuppyGa4` consent API. SurgeIndex
is not loaded until HiGuppy analytics consent is `granted`; deny/reset stops the
tracker and grant clears the opt-out before resuming it on the same page. The
server-side route gate keeps the script off account, checkout, order, password
reset, WooCommerce endpoint, and identifier-bearing query-string routes. The
tracker also replaces identifier-like pathname segments with `:id` before an
event is serialized. It sends only anonymous traffic metadata documented in the
plugin header, never WooCommerce cart, order, account, form, or page-content
data.

`surgeindex-revenue-sync.php` is a WP-CLI-only bridge for the owner-approved
public stats board. It reads only WooCommerce orders in `processing` or
`completed`, subtracts confirmed refunds, and posts a currency-normalized
aggregate to SurgeIndex. Cancelled and on-hold orders are deliberately
excluded. The bridge sends no order IDs, customer information, or credentials;
the VPS systemd timer supplies the private `INTERNAL_SERVICE_TOKEN`.
