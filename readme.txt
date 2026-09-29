=== Schedulify Delivery – WooCommerce Zone Delivery Date & Schedule Matrix ===
Contributors: alihasandeveloper
Donate link: https://github.com/alihasandeveloper/
Tags: woocommerce, delivery date, delivery scheduler, order delivery, shipping matrix, delivery time, lead time
Requires at least: 5.8
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later
License URI: https://www.gnu.org/licenses/gpl-2.0.html

Advanced delivery date scheduler for WooCommerce with zone-specific delivery matrix rules, cut-off delay hours, weekly off-days, and custom holiday blackout controls.

== Description ==

**Schedulify Delivery** empowers WooCommerce store owners with dynamic, zone-specific delivery date scheduling. Set lead times (preparation delay in hours), define weekly recurring off-days, configure holiday/vacation blackout periods, and customize rules per shipping zone and shipping method.

Whether you run a local bakery, restaurant, grocery, flower shop, or an eCommerce store with varying delivery lead times across regions, **Schedulify Delivery** gives you complete control over when customers can receive their orders.

### 🌟 Key Features

* **Zone & Shipping Method-Specific Rules:** Configure distinct lead times, weekly off-days, and holiday blackout schedules for different shipping zones and methods.
* **Lead Time & Delay Hours Matrix:** Define preparation delay in hours (e.g., 0 hours for same-day delivery, 24 hours for next-day, 48 hours for 2-day preparation). The calendar dynamically disables unavailable immediate dates based on real-time server cut-off.
* **Weekly Recurring Off-Days:** Automatically disable specific days of the week (e.g., Sunday, Friday) globally or per delivery zone.
* **Date Range Blackouts (Vacations & Maintenance):** Block entire date ranges (e.g., Eid holidays, Christmas vacation, store maintenance) with optional custom reasons.
* **Specific Blackout & Holiday Dates:** Comma or newline-separated specific dates when delivery is unavailable.
* **Allowed Date Overrides:** Mark specific dates as always deliverable, overriding weekly off-days (e.g., special holiday weekend deliveries).
* **Interactive Flatpickr Calendar:** Smooth, responsive, mobile-optimized datepicker integrated seamlessly on Classic Checkout and Block Checkout.
* **High-Performance Order Storage (HPOS) Ready:** Full compatibility with WooCommerce Custom Order Tables (HPOS).
* **Order Management & Admin Overview:** View and edit scheduled delivery dates directly within WooCommerce Admin Order Details and the Orders List table.
* **Customer Confirmation:** Delivery schedule details displayed on the Order Received (Thank You) page, Customer Account View Order, and order metadata.

== Installation ==

1. Upload the `schedulify-delivery` folder to the `/wp-content/plugins/` directory, or install the plugin directly through the WordPress plugins screen.
2. Activate the plugin through the 'Plugins' menu in WordPress.
3. Navigate to **WooCommerce > Delivery Scheduler** to configure your general delivery settings and zone-specific rules.

== Frequently Asked Questions ==

= Does this plugin support WooCommerce High-Performance Order Storage (HPOS)? =
Yes, Schedulify Delivery is built and tested with full HPOS compatibility.

= Can I configure different delivery delay hours for different cities/zones? =
Yes! You can create dedicated Zone Rules under **WooCommerce > Delivery Scheduler > Zone Settings** for any city, district, or WooCommerce shipping zone.

= What happens if a customer changes their shipping location or shipping method at checkout? =
The checkout datepicker automatically recalculates available delivery dates via real-time matrix evaluation based on the selected location and shipping method.

= Can I edit the delivery date of an existing order as an admin? =
Yes, store administrators can view and update the scheduled delivery date directly inside the WooCommerce Order Edit screen.

== Screenshots ==

1. General delivery settings and global off-days configuration.
2. Zone delivery rules table with lead times and shipping method assignments.
3. Multi-step modal for adding and configuring zone delivery matrix rules.
4. Clean, responsive datepicker on the WooCommerce checkout page.
5. Scheduled delivery date display in WooCommerce Admin Orders list and Order Details.

== Changelog ==

= 1.0.0 =
* Initial public release.
* Dynamic delivery availability matrix engine.
* Zone-specific lead times, delay hours, and shipping method filtering via AJAX.
* Weekly off-days, disabled date ranges, blackout holidays, and allowed date exceptions.
* HPOS and Block Checkout compatibility.

== Upgrade Notice ==

= 1.0.0 =
* Welcome to Schedulify Delivery 1.0.0! Initial release.
