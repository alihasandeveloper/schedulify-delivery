<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Schedulify Dynamic Checkout Handler
 * Automatically reveals Shipping Methods, Delivery Date Matrix, and Payment Options
 * immediately upon customer district selection.
 */
class Schedulify_Multistep_Checkout {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('wp_enqueue_scripts', [$this, 'enqueue_multistep_assets'], 20);
    }

    /**
     * Enqueue Dynamic Checkout Assets
     */
    public function enqueue_multistep_assets() {
        if (!function_exists('is_checkout') || !is_checkout() || is_order_received_page()) {
            return;
        }

        $css_file = SCHEDULIFY_PLUGIN_DIR . 'assets/css/schedulify-multistep.css';
        $js_file  = SCHEDULIFY_PLUGIN_DIR . 'assets/js/schedulify-multistep.js';
        $css_ver  = file_exists($css_file) ? filemtime($css_file) : SCHEDULIFY_VERSION;
        $js_ver   = file_exists($js_file) ? filemtime($js_file) : SCHEDULIFY_VERSION;

        wp_enqueue_style(
            'schedulify-multistep-css',
            SCHEDULIFY_PLUGIN_URL . 'assets/css/schedulify-multistep.css',
            [],
            $css_ver
        );

        wp_enqueue_script(
            'schedulify-multistep-js',
            SCHEDULIFY_PLUGIN_URL . 'assets/js/schedulify-multistep.js',
            ['jquery'],
            $js_ver,
            true
        );

        wp_localize_script('schedulify-multistep-js', 'schedulify_multistep_params', [
            'i18n' => [
                'select_district' => __('Please select your district to view shipping and delivery options.', 'schedulify-delivery'),
            ],
            'ajax_url' => admin_url('admin-ajax.php'),
        ]);
    }
}
