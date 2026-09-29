<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Schedulify Multi-Step Checkout Handler
 * Splits WooCommerce checkout into a seamless 2-step flow:
 * Step 1: Customer & Billing/Shipping Information
 * Step 2: Shipping Methods, Schedulify Delivery Matrix & Payment
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
        // Enqueue Assets on checkout page
        add_action('wp_enqueue_scripts', [$this, 'enqueue_multistep_assets'], 20);

        // Render Wizard Header / Progress Indicator
        add_action('woocommerce_before_checkout_form', [$this, 'render_step_wizard_bar'], 5);

        // Step 1: Customer & Billing/Shipping Details Wrapper
        add_action('woocommerce_checkout_before_customer_details', [$this, 'step_1_start'], 1);
        add_action('woocommerce_checkout_after_customer_details', [$this, 'step_1_end'], 999);

        // Step 2: Review, Shipping, Delivery Scheduler & Payment Wrapper
        add_action('woocommerce_checkout_before_order_review_heading', [$this, 'step_2_start'], 1);
        add_action('woocommerce_checkout_after_order_review', [$this, 'step_2_end'], 999);
    }

    /**
     * Enqueue Multi-step CSS and JS
     */
    public function enqueue_multistep_assets() {
        if (!function_exists('is_checkout') || !is_checkout() || is_order_received_page()) {
            return;
        }

        wp_enqueue_style(
            'schedulify-multistep-css',
            SCHEDULIFY_PLUGIN_URL . 'assets/css/schedulify-multistep.css',
            [],
            SCHEDULIFY_VERSION
        );

        wp_enqueue_script(
            'schedulify-multistep-js',
            SCHEDULIFY_PLUGIN_URL . 'assets/js/schedulify-multistep.js',
            ['jquery'],
            SCHEDULIFY_VERSION,
            true
        );

        wp_localize_script('schedulify-multistep-js', 'schedulify_multistep_params', [
            'i18n' => [
                'required_field' => __('Please fill in all required fields before proceeding.', 'schedulify-delivery'),
                'invalid_email'  => __('Please enter a valid email address.', 'schedulify-delivery'),
                'invalid_phone'  => __('Please enter a valid contact phone number.', 'schedulify-delivery'),
                'step1_title'    => __('Billing & Address', 'schedulify-delivery'),
                'step2_title'    => __('Shipping & Payment', 'schedulify-delivery'),
            ],
            'ajax_url' => admin_url('admin-ajax.php'),
        ]);
    }

    /**
     * Renders the Step Wizard Progress Bar at the top of checkout form
     */
    public function render_step_wizard_bar() {
        ?>
        <div class="schedulify-multistep-wizard" id="schedulify-multistep-wizard">
            <div class="schedulify-wizard-step step-1 active" data-step="1">
                <div class="schedulify-step-badge">
                    <span class="schedulify-step-num">1</span>
                    <span class="schedulify-step-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
                </div>
                <div class="schedulify-step-info">
                    <span class="schedulify-step-subtitle"><?php esc_html_e('Step 1', 'schedulify-delivery'); ?></span>
                    <span class="schedulify-step-title"><?php esc_html_e('Customer & Address', 'schedulify-delivery'); ?></span>
                </div>
            </div>

            <div class="schedulify-wizard-divider">
                <div class="schedulify-divider-line"></div>
            </div>

            <div class="schedulify-wizard-step step-2" data-step="2">
                <div class="schedulify-step-badge">
                    <span class="schedulify-step-num">2</span>
                    <span class="schedulify-step-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
                </div>
                <div class="schedulify-step-info">
                    <span class="schedulify-step-subtitle"><?php esc_html_e('Step 2', 'schedulify-delivery'); ?></span>
                    <span class="schedulify-step-title"><?php esc_html_e('Delivery & Payment', 'schedulify-delivery'); ?></span>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Start Step 1 Container
     */
    public function step_1_start() {
        echo '<div class="schedulify-step-content schedulify-step-content-1 active" id="schedulify-step-1-content">';
    }

    /**
     * End Step 1 Container and add Next button
     */
    public function step_1_end() {
        ?>
        <div class="schedulify-step-actions schedulify-step-1-actions">
            <button type="button" class="button alt schedulify-btn schedulify-btn-next" id="schedulify-to-step-2-btn">
                <span><?php esc_html_e('Next: Delivery & Payment', 'schedulify-delivery'); ?></span>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                    <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
            </button>
        </div>
        </div><!-- /.schedulify-step-content-1 -->
        <?php
    }

    /**
     * Start Step 2 Container and add Back button
     */
    public function step_2_start() {
        echo '<div class="schedulify-step-content schedulify-step-content-2" id="schedulify-step-2-content">';
        ?>
        <div class="schedulify-step-top-nav">
            <button type="button" class="schedulify-btn-back-link" id="schedulify-back-to-step-1-top-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span><?php esc_html_e('Back to Address Information', 'schedulify-delivery'); ?></span>
            </button>
        </div>
        <?php
    }

    /**
     * End Step 2 Container
     */
    public function step_2_end() {
        ?>
        <div class="schedulify-step-actions schedulify-step-2-actions">
            <button type="button" class="button schedulify-btn-secondary" id="schedulify-back-to-step-1-btn">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"></line>
                    <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                <span><?php esc_html_e('Edit Address Details', 'schedulify-delivery'); ?></span>
            </button>
        </div>
        </div><!-- /.schedulify-step-content-2 -->
        <?php
    }
}
