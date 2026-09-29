<?php
/**
 * Plugin Name:       Schedulify Delivery – WooCommerce Zone Delivery Date & Schedule Matrix
 * Plugin URI:        https://boomdevs.com/plugins/schedulify-delivery/
 * Description:       Advanced delivery date scheduler for WooCommerce with zone-specific delivery matrix rules, cut-off delay hours, weekly off-days, and custom holiday blackout controls.
 * Version:           1.0.0
 * Author:            Ali Hasan
 * Author URI:        https://github.com/alihasandeveloper/
 * License:           GPLv2 or later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       schedulify-delivery
 * Domain Path:       /languages
 * Requires at least: 5.8
 * Requires PHP:      7.4
 * WC requires at least: 5.0
 * WC tested up to:   9.4
 */

if (!defined('ABSPATH')) {
    exit; // Exit if accessed directly.
}

define('SCHEDULIFY_VERSION', '1.0.0');
define('SCHEDULIFY_PLUGIN_FILE', __FILE__);
define('SCHEDULIFY_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SCHEDULIFY_PLUGIN_URL', plugin_dir_url(__FILE__));

// Declare HPOS compatibility
add_action('before_woocommerce_init', function () {
    if (class_exists(\Automattic\WooCommerce\Utilities\FeaturesUtil::class)) {
        \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', __FILE__, true);
    }
});

/**
 * Main Plugin Class
 */
final class Schedulify_Delivery {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $this->includes();
        $this->init_hooks();
    }

    private function includes() {
        require_once SCHEDULIFY_PLUGIN_DIR . 'includes/class-schedulify-db.php';
        require_once SCHEDULIFY_PLUGIN_DIR . 'includes/class-schedulify-matrix-calculator.php';
        require_once SCHEDULIFY_PLUGIN_DIR . 'includes/class-schedulify-settings.php';
        require_once SCHEDULIFY_PLUGIN_DIR . 'includes/class-schedulify-checkout.php';
        require_once SCHEDULIFY_PLUGIN_DIR . 'includes/class-schedulify-order.php';
    }

    private function init_hooks() {
        add_action('plugins_loaded', [$this, 'on_plugins_loaded']);
        add_action('init', [$this, 'load_textdomain']);
        add_action('admin_init', [$this, 'check_db_updates']);
        register_activation_hook(SCHEDULIFY_PLUGIN_FILE, [$this, 'activate']);
    }

    public function check_db_updates() {
        if (class_exists('Schedulify_DB')) {
            $db_ver = get_option('schedulify_db_version', '1.0.0');
            if (version_compare($db_ver, '1.1.0', '<')) {
                Schedulify_DB::create_tables();
                update_option('schedulify_db_version', '1.1.0');
            }
        }
    }

    public function load_textdomain() {
        load_plugin_textdomain('schedulify-delivery', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }

    public function on_plugins_loaded() {
        if (!class_exists('WooCommerce')) {
            return;
        }

        // Initialize sub-classes
        Schedulify_Settings::get_instance();
        Schedulify_Checkout::get_instance();
        Schedulify_Order::get_instance();
    }

    public function activate() {
        // Create custom database tables on activation
        Schedulify_DB::create_tables();
    }
}

// Instantiate
Schedulify_Delivery::get_instance();
