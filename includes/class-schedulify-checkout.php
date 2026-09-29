<?php
if (!defined('ABSPATH')) {
    exit;
}

class Schedulify_Checkout {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        $settings = Schedulify_Settings::get_settings();
        if ('yes' !== ($settings['enabled'] ?? 'yes')) {
            return;
        }

        $position = !empty($settings['field_position']) ? $settings['field_position'] : 'woocommerce_review_order_before_payment';
        add_action($position, [$this, 'render_delivery_scheduler_field']);
        add_action('wp_footer', [$this, 'render_block_checkout_fallback']);
        add_action('wp_enqueue_scripts', [$this, 'enqueue_checkout_assets']);

        // Checkout Validation Hooks for both Classic and Block Checkout
        add_action('woocommerce_checkout_process', [$this, 'validate_checkout_fields']);
        add_action('woocommerce_after_checkout_validation', [$this, 'validate_after_checkout_validation'], 10, 2);
        add_action('woocommerce_store_api_checkout_update_order_from_request', [$this, 'validate_store_api_checkout'], 5, 2);
        add_action('woocommerce_checkout_create_order', [$this, 'validate_before_order_creation'], 5, 2);

        // Ajax for session sync (especially for WooCommerce Block Checkout)
        add_action('wp_ajax_schedulify_update_session', [$this, 'ajax_update_session']);
        add_action('wp_ajax_nopriv_schedulify_update_session', [$this, 'ajax_update_session']);
    }

    /**
     * Get the active Bangladesh District Code for current customer / cart
     */
    public static function get_customer_district_code() {
        if (!function_exists('WC')) {
            return '';
        }

        $state = '';
        $city = '';

        if (WC()->customer) {
            $state = WC()->customer->get_shipping_state() ?: WC()->customer->get_billing_state();
            $city  = WC()->customer->get_shipping_city() ?: WC()->customer->get_billing_city();
        }

        if (empty($state) && !empty($_POST['shipping_state'])) {
            $state = sanitize_text_field($_POST['shipping_state']);
        }
        if (empty($state) && !empty($_POST['billing_state'])) {
            $state = sanitize_text_field($_POST['billing_state']);
        }
        if (empty($city) && !empty($_POST['shipping_city'])) {
            $city = sanitize_text_field($_POST['shipping_city']);
        }
        if (empty($city) && !empty($_POST['billing_city'])) {
            $city = sanitize_text_field($_POST['billing_city']);
        }

        if (!empty($state)) {
            return $state;
        }

        // Try mapping city name to district code
        if (!empty($city)) {
            $districts = Schedulify_Settings::get_bangladesh_districts();
            foreach ($districts as $code => $name) {
                $clean_name = trim(preg_replace('/\s*\(.*?\)\s*/', '', $name));
                if (strcasecmp($clean_name, $city) === 0 || stripos($name, $city) !== false) {
                    return $code;
                }
            }
        }

        return '';
    }

    /**
     * Get customer chosen shipping method from WooCommerce session
     */
    public static function get_customer_shipping_method() {
        if (function_exists('WC') && WC()->session) {
            $chosen_methods = WC()->session->get('chosen_shipping_methods');
            if (!empty($chosen_methods) && is_array($chosen_methods)) {
                return reset($chosen_methods);
            }
        }
        return '';
    }

    /**
     * Find matched rule for a specific district code and shipping method, or fallback to general settings
     */
    public static function get_effective_rule_for_district($district_code = null, $shipping_method_id = null) {
        $settings = Schedulify_Settings::get_settings();
        if (null === $district_code) {
            $district_code = self::get_customer_district_code();
        }
        if (null === $shipping_method_id) {
            $shipping_method_id = self::get_customer_shipping_method();
        }

        $zone_rules = (array)($settings['zone_rules'] ?? []);
        $found_rule = null;

        if (!empty($district_code)) {
            foreach ($zone_rules as $rule) {
                $assigned_districts = (array)($rule['districts'] ?? []);
                if (in_array($district_code, $assigned_districts, true)) {
                    $found_rule = $rule;
                    break;
                }
            }
        }

        if ($found_rule) {
            $rule_methods = !empty($found_rule['methods']) && is_array($found_rule['methods']) ? $found_rule['methods'] : [];
            $matched_method_conf = null;

            if (!empty($shipping_method_id) && !empty($rule_methods)) {
                if (isset($rule_methods[$shipping_method_id])) {
                    $matched_method_conf = $rule_methods[$shipping_method_id];
                } else {
                    foreach ($rule_methods as $mk => $mconf) {
                        if ($mk === $shipping_method_id || 0 === strpos($shipping_method_id, $mk) || 0 === strpos($mk, $shipping_method_id)) {
                            $matched_method_conf = $mconf;
                            break;
                        }
                    }
                }
            }

            if (!$matched_method_conf && !empty($rule_methods)) {
                $matched_method_conf = reset($rule_methods);
            }

            $delay_hours = isset($matched_method_conf['delay_hours']) ? max(0, intval($matched_method_conf['delay_hours'])) : max(0, intval($found_rule['delay_hours'] ?? 0));
            $rule_off_days = !empty($matched_method_conf['off_days']) ? (array)$matched_method_conf['off_days'] : (!empty($found_rule['off_days']) ? (array)$found_rule['off_days'] : (array)($settings['off_days'] ?? []));
            $rule_ranges   = !empty($matched_method_conf['disabled_date_ranges']) ? (array)$matched_method_conf['disabled_date_ranges'] : (!empty($found_rule['disabled_date_ranges']) ? (array)$found_rule['disabled_date_ranges'] : (array)($settings['disabled_date_ranges'] ?? []));
            $rule_blackout = (isset($matched_method_conf['blackout_dates']) && trim($matched_method_conf['blackout_dates']) !== '') ? $matched_method_conf['blackout_dates'] : ((isset($found_rule['blackout_dates']) && trim($found_rule['blackout_dates']) !== '') ? $found_rule['blackout_dates'] : ($settings['blackout_dates'] ?? ''));
            $rule_allowed  = (isset($matched_method_conf['allowed_dates']) && trim($matched_method_conf['allowed_dates']) !== '') ? $matched_method_conf['allowed_dates'] : ((isset($found_rule['allowed_dates']) && trim($found_rule['allowed_dates']) !== '') ? $found_rule['allowed_dates'] : ($settings['allowed_dates'] ?? ''));

            return [
                'source'                => 'zone_rule',
                'id'                    => $found_rule['id'] ?? '',
                'shipping_method_id'    => $matched_method_conf['shipping_method_id'] ?? ($found_rule['shipping_method_id'] ?? 'all'),
                'shipping_method_title' => $matched_method_conf['shipping_method_title'] ?? ($found_rule['shipping_method_title'] ?? ''),
                'district_code'         => $district_code,
                'delay_hours'           => $delay_hours,
                'off_days'              => $rule_off_days,
                'disabled_date_ranges'  => $rule_ranges,
                'blackout_dates'        => $rule_blackout,
                'allowed_dates'         => $rule_allowed,
                'max_advance_days'      => intval($settings['max_advance_days'] ?? 56),
            ];
        }

        // Fallback to General Settings
        return [
            'source'                => 'general',
            'id'                    => 'general_default',
            'shipping_method_id'    => 'all',
            'shipping_method_title' => '',
            'district_code'         => $district_code,
            'delay_hours'           => max(0, intval($settings['delay_hours'] ?? 0)),
            'off_days'              => (array)($settings['off_days'] ?? []),
            'disabled_date_ranges'  => (array)($settings['disabled_date_ranges'] ?? []),
            'blackout_dates'        => $settings['blackout_dates'] ?? '',
            'allowed_dates'         => $settings['allowed_dates'] ?? '',
            'max_advance_days'      => intval($settings['max_advance_days'] ?? 56),
        ];
    }

    /**
     * Get precalculated matrices for all configured rules and general settings
     */
    public static function get_all_matrices() {
        $settings = Schedulify_Settings::get_settings();
        $zone_rules = (array)($settings['zone_rules'] ?? []);
        $matrices = [];

        // General default matrix
        $general_calc = new Schedulify_Matrix_Calculator([
            'delay_hours'          => max(0, intval($settings['delay_hours'] ?? 0)),
            'max_advance_days'     => intval($settings['max_advance_days'] ?? 56),
            'off_days'             => (array)($settings['off_days'] ?? []),
            'disabled_date_ranges' => (array)($settings['disabled_date_ranges'] ?? []),
            'blackout_dates'       => $settings['blackout_dates'] ?? '',
            'allowed_dates'        => $settings['allowed_dates'] ?? '',
        ]);
        $matrices['general_default'] = $general_calc->get_delivery_availability_matrix();

        // Specific district rules
        foreach ($zone_rules as $rule) {
            $rule_id = $rule['id'] ?? '';
            if (!$rule_id) continue;

            $rule_off_days = !empty($rule['off_days']) ? (array)$rule['off_days'] : (array)($settings['off_days'] ?? []);
            $rule_ranges   = !empty($rule['disabled_date_ranges']) ? (array)$rule['disabled_date_ranges'] : (array)($settings['disabled_date_ranges'] ?? []);
            $rule_blackout = (isset($rule['blackout_dates']) && trim($rule['blackout_dates']) !== '') ? $rule['blackout_dates'] : ($settings['blackout_dates'] ?? '');
            $rule_allowed  = (isset($rule['allowed_dates']) && trim($rule['allowed_dates']) !== '') ? $rule['allowed_dates'] : ($settings['allowed_dates'] ?? '');

            $rule_calc = new Schedulify_Matrix_Calculator([
                'delay_hours'          => max(0, intval($rule['delay_hours'] ?? 0)),
                'max_advance_days'     => intval($settings['max_advance_days'] ?? 56),
                'off_days'             => $rule_off_days,
                'disabled_date_ranges' => $rule_ranges,
                'blackout_dates'       => $rule_blackout,
                'allowed_dates'        => $rule_allowed,
            ]);
            $matrices[$rule_id] = $rule_calc->get_delivery_availability_matrix();
        }

        return $matrices;
    }

    private $has_rendered = false;

    public function enqueue_checkout_assets() {
        if (!is_checkout() && !is_order_received_page()) {
            return;
        }

        $settings = Schedulify_Settings::get_settings();

        // Enqueue Flatpickr Vendor files
        wp_enqueue_style(
            'schedulify-flatpickr-css',
            SCHEDULIFY_PLUGIN_URL . 'assets/vendor/flatpickr/flatpickr.min.css',
            [],
            '4.6.13'
        );

        wp_enqueue_script(
            'schedulify-flatpickr-js',
            SCHEDULIFY_PLUGIN_URL . 'assets/vendor/flatpickr/flatpickr.min.js',
            [],
            '4.6.13',
            true
        );

        // Enqueue Checkout plugin assets
        $js_ver = file_exists(SCHEDULIFY_PLUGIN_DIR . 'assets/js/schedulify-checkout.js') ? filemtime(SCHEDULIFY_PLUGIN_DIR . 'assets/js/schedulify-checkout.js') : time();
        $css_ver = file_exists(SCHEDULIFY_PLUGIN_DIR . 'assets/css/schedulify-checkout.css') ? filemtime(SCHEDULIFY_PLUGIN_DIR . 'assets/css/schedulify-checkout.css') : time();

        wp_enqueue_style(
            'schedulify-checkout-css',
            SCHEDULIFY_PLUGIN_URL . 'assets/css/schedulify-checkout.css',
            ['schedulify-flatpickr-css'],
            $css_ver
        );

        wp_enqueue_script(
            'schedulify-checkout-js',
            SCHEDULIFY_PLUGIN_URL . 'assets/js/schedulify-checkout.js',
            ['jquery', 'schedulify-flatpickr-js', 'wp-api-fetch', 'wp-data'],
            $js_ver,
            true
        );

        $now_timestamp = function_exists('current_time') ? current_time('timestamp') : time();
        $server_date = function_exists('wp_date') ? wp_date('Y-m-d') : (function_exists('current_time') ? current_time('Y-m-d') : date('Y-m-d'));
        $server_time = function_exists('wp_date') ? wp_date('H:i') : (function_exists('current_time') ? current_time('H:i') : date('H:i'));

        $active_district_code = self::get_customer_district_code();
        $active_rule = self::get_effective_rule_for_district($active_district_code);
        $all_matrices = self::get_all_matrices();

        // District code to Rule mapping for JS
        $district_to_rule_map = [];
        $zone_rules = (array)($settings['zone_rules'] ?? []);
        foreach ($zone_rules as $rule) {
            $r_id = $rule['id'] ?? '';
            $r_districts = (array)($rule['districts'] ?? []);
            foreach ($r_districts as $dcode) {
                $district_to_rule_map[$dcode] = $r_id;
            }
        }

        wp_localize_script('schedulify-checkout-js', 'schedulifyData', [
            'rest_url'              => esc_url_raw(rest_url()),
            'rest_nonce'            => wp_create_nonce('wp_rest'),
            'settings'              => [
                'required'             => ($settings['field_required'] ?? 'yes') === 'yes',
                'max_advance_days'     => intval($settings['max_advance_days'] ?? 56),
                'delay_hours'          => max(0, intval($settings['delay_hours'] ?? 0)),
                'off_days'             => (array)($settings['off_days'] ?? []),
                'blackout_dates'       => $settings['blackout_dates'] ?? '',
                'allowed_dates'        => $settings['allowed_dates'] ?? '',
                'disabled_date_ranges' => (array)($settings['disabled_date_ranges'] ?? []),
            ],
            'active_district_code'  => $active_district_code,
            'active_rule'           => $active_rule,
            'district_to_rule_map'  => $district_to_rule_map,
            'all_districts'         => Schedulify_Settings::get_bangladesh_districts(),
            'zone_rules'            => $zone_rules,
            'matrices'              => $all_matrices,
            'serverTime'            => [
                'date'      => $server_date,
                'time'      => $server_time,
                'timestamp' => $now_timestamp,
            ],
            'ajax_url'              => admin_url('admin-ajax.php'),
            'nonce'                 => wp_create_nonce('schedulify_checkout_nonce'),
            'i18n'                  => [
                'selectDate'    => __('Select a delivery date', 'schedulify-delivery'),
                'scheduleDate'  => __('Choose Date', 'schedulify-delivery'),
                'notAvailable'  => __('Delivery is not available on the selected date', 'schedulify-delivery'),
            ]
        ]);
    }

    public function render_block_checkout_fallback() {
        if (is_order_received_page() || (function_exists('is_wc_endpoint_url') && is_wc_endpoint_url('order-received'))) {
            return;
        }
        if (!$this->has_rendered && is_checkout()) {
            echo '<div id="schedulify-block-fallback-container">';
            $this->render_delivery_scheduler_field();
            echo '</div>';
        }
    }

    public function ajax_update_session() {
        check_ajax_referer('schedulify_checkout_nonce', 'nonce');
        if (!function_exists('WC') || !WC()->session) {
            wp_send_json_error(['message' => 'No session']);
        }

        $data = [
            'date'  => sanitize_text_field($_POST['date'] ?? ''),
            'notes' => sanitize_text_field($_POST['notes'] ?? ''),
        ];

        WC()->session->set('schedulify_delivery_data', $data);
        wp_send_json_success($data);
    }

    public function render_delivery_scheduler_field() {
        if (is_order_received_page() || (function_exists('is_wc_endpoint_url') && is_wc_endpoint_url('order-received'))) {
            return;
        }
        $this->has_rendered = true;
        $settings = Schedulify_Settings::get_settings();
        $is_required = ($settings['field_required'] ?? 'yes') === 'yes';
        ?>
        <div id="schedulify-delivery-scheduler-wrapper" class="schedulify-scheduler-card">
            <div class="schedulify-card-body">
                <!-- Date Picker Field -->
                <div class="schedulify-form-group schedulify-date-group" id="schedulify-datepicker-container">
                    <label for="schedulify_delivery_date" class="schedulify-group-label">
                        <?php _e('Delivery Date', 'schedulify-delivery'); ?>
                        <?php if ($is_required) : ?><span class="required">*</span><?php endif; ?>
                    </label>
                    <div class="schedulify-input-icon-wrapper">
                        <input type="text" 
                                id="schedulify_delivery_date_display" 
                                class="input-text schedulify-calendar-input" 
                                placeholder="<?php esc_attr_e('Click to select a date...', 'schedulify-delivery'); ?>" 
                                readonly>
                        <input type="hidden" name="schedulify_delivery_date" id="schedulify_delivery_date" value="">
                        <span class="schedulify-input-calendar-icon">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                        </span>
                    </div>
                </div>
            </div>
        </div>
        <?php
    }

    /**
     * Get the submitted delivery date from either POST data or WooCommerce Session
     */
    public static function get_submitted_delivery_date() {
        if (!empty($_POST['schedulify_delivery_date'])) {
            return sanitize_text_field($_POST['schedulify_delivery_date']);
        }
        if (function_exists('WC') && WC()->session) {
            $data = WC()->session->get('schedulify_delivery_data');
            if (!empty($data['date'])) {
                return sanitize_text_field($data['date']);
            }
        }
        return '';
    }

    /**
     * Common validation rule checking
     *
     * @param string $delivery_date
     * @return string Error message if invalid, empty string if valid
     */
    public static function get_delivery_validation_error($delivery_date) {
        $settings = Schedulify_Settings::get_settings();
        $is_required = ($settings['field_required'] ?? 'yes') === 'yes';

        if ($is_required && empty($delivery_date)) {
            return __('Please select a delivery date for your order.', 'schedulify-delivery');
        }

        if (!empty($delivery_date)) {
            // Validate date format YYYY-MM-DD
            $dt = DateTime::createFromFormat('Y-m-d', $delivery_date);
            if (!$dt || $dt->format('Y-m-d') !== $delivery_date) {
                return __('Invalid delivery date format provided.', 'schedulify-delivery');
            }

            // Prevent dates in the past
            $today_str = function_exists('wp_date') ? wp_date('Y-m-d') : (function_exists('current_time') ? current_time('Y-m-d') : date('Y-m-d'));
            if ($delivery_date < $today_str) {
                return __('Cannot select a past date for delivery.', 'schedulify-delivery');
            }

            // Get active district rule & calculate its availability matrix
            $active_rule = self::get_effective_rule_for_district();
            $calc = new Schedulify_Matrix_Calculator($active_rule);
            $matrix = $calc->get_delivery_availability_matrix();

            if (!isset($matrix['standard'][$delivery_date]) || false === $matrix['standard'][$delivery_date]) {
                if (!empty($active_rule['delay_hours']) && $delivery_date < ($matrix['earliest_allowed_ymd'] ?? $today_str)) {
                    return sprintf(
                        __('Deliveries to your zone require at least %d hours advance preparation. Please select a date on or after %s.', 'schedulify-delivery'),
                        $active_rule['delay_hours'],
                        $matrix['earliest_allowed_ymd']
                    );
                }
                return __('Sorry, we cannot deliver on the selected date. Please choose another delivery date.', 'schedulify-delivery');
            }
        }

        return '';
    }

    /**
     * Classic Checkout Validation
     */
    public function validate_checkout_fields() {
        $error = self::get_delivery_validation_error(self::get_submitted_delivery_date());
        if (!empty($error)) {
            wc_add_notice($error, 'error');
        }
    }

    /**
     * WooCommerce After Checkout Validation Hook
     */
    public function validate_after_checkout_validation($data, $errors) {
        $error = self::get_delivery_validation_error(self::get_submitted_delivery_date());
        if (!empty($error) && is_wp_error($errors)) {
            $errors->add('schedulify_delivery_date_error', $error);
        }
    }

    /**
     * WooCommerce Store API (Block Checkout) Validation Hook
     */
    public function validate_store_api_checkout($order, $request) {
        $error = self::get_delivery_validation_error(self::get_submitted_delivery_date());
        if (!empty($error)) {
            if (class_exists('\Automattic\WooCommerce\StoreApi\Exceptions\RouteException')) {
                throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException(
                    'woocommerce_rest_missing_delivery_date',
                    $error,
                    400
                );
            } else {
                throw new Exception($error);
            }
        }
    }

    /**
     * Final safety check before order creation
     */
    public function validate_before_order_creation($order, $data) {
        $error = self::get_delivery_validation_error(self::get_submitted_delivery_date());
        if (!empty($error)) {
            throw new Exception($error);
        }
    }
}

// Backward compatibility alias
if (!class_exists('schedulify_Checkout')) {
    class_alias('Schedulify_Checkout', 'schedulify_Checkout');
}
