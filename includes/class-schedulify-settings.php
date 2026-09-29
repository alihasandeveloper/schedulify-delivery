<?php
if (!defined('ABSPATH')) {
    exit;
}

class Schedulify_Settings {

    private static $instance = null;
    private $settings_key = 'schedulify_delivery_settings';

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'handle_form_actions']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
        add_action('wp_ajax_schedulify_get_shipping_methods_by_zones', [$this, 'ajax_get_shipping_methods_by_zones']);
    }

    public static function get_settings() {
        if (class_exists('Schedulify_DB')) {
            return Schedulify_DB::get_all_settings();
        } elseif (class_exists('schedulify_DB')) {
            return schedulify_DB::get_all_settings();
        }

        $defaults = [
            'enabled'              => 'yes',
            'field_required'       => 'yes',
            'field_position'       => 'woocommerce_after_order_notes',
            'delay_hours'          => 0,
            'max_advance_days'     => 56,
            'off_days'             => [0],
            'blackout_dates'       => '',
            'disabled_date_ranges' => [],
            'allowed_dates'        => '',
            'zone_rules'           => [],
        ];

        $saved = get_option('schedulify_delivery_settings', []);
        if (empty($saved)) {
            $saved = get_option('schedulify_settings', []);
        }
        return wp_parse_args($saved, $defaults);
    }

    public function add_admin_menu() {
        add_submenu_page(
            'woocommerce',
            __('Schedulify Delivery', 'schedulify-delivery'),
            __('Schedulify Delivery', 'schedulify-delivery'),
            'manage_woocommerce',
            'schedulify-delivery',
            [$this, 'render_settings_page']
        );
    }

    public function enqueue_admin_assets($hook) {
        if ('woocommerce_page_schedulify-delivery' !== $hook && 'woocommerce_page_schedulify-delivery-scheduler' !== $hook) {
            return;
        }

        $ver = defined('WP_DEBUG') && WP_DEBUG ? time() : SCHEDULIFY_VERSION;
        $css_ver = file_exists(SCHEDULIFY_PLUGIN_DIR . 'assets/css/schedulify-admin.css') ? filemtime(SCHEDULIFY_PLUGIN_DIR . 'assets/css/schedulify-admin.css') : $ver;
        $js_ver  = file_exists(SCHEDULIFY_PLUGIN_DIR . 'assets/js/schedulify-admin.js') ? filemtime(SCHEDULIFY_PLUGIN_DIR . 'assets/js/schedulify-admin.js') : $ver;

        wp_enqueue_style(
            'schedulify-admin-css',
            SCHEDULIFY_PLUGIN_URL . 'assets/css/schedulify-admin.css',
            [],
            $css_ver
        );

        wp_enqueue_script(
            'schedulify-admin-js',
            SCHEDULIFY_PLUGIN_URL . 'assets/js/schedulify-admin.js',
            ['jquery'],
            $js_ver,
            true
        );

        $settings = self::get_settings();

        $days_of_week = [
            0 => __('Sunday (রবিবার)', 'schedulify-delivery'),
            1 => __('Monday (সোমবার)', 'schedulify-delivery'),
            2 => __('Tuesday (মঙ্গলবার)', 'schedulify-delivery'),
            3 => __('Wednesday (বুধবার)', 'schedulify-delivery'),
            4 => __('Thursday (বৃহস্পতিবার)', 'schedulify-delivery'),
            5 => __('Friday (শুক্রবার)', 'schedulify-delivery'),
            6 => __('Saturday (শনিবার)', 'schedulify-delivery'),
        ];

        $localized_data = [
            'ajax_url'   => admin_url('admin-ajax.php'),
            'nonce'      => wp_create_nonce('schedulify_admin_nonce'),
            'zoneRules'  => $settings['zone_rules'] ?? [],
            'daysOfWeek' => $days_of_week,
            'i18n'       => [
                'selectZoneError'    => __('Please select at least one zone to proceed.', 'schedulify-delivery'),
                'methodRequired'     => __('Please configure at least one shipping method.', 'schedulify-delivery'),
                'delayRequired'      => __('Please enter a valid Delivery Delay in Hours (0 or more) for enabled methods.', 'schedulify-delivery'),
                'confirmDelete'      => __('Are you sure you want to delete this zone rule?', 'schedulify-delivery'),
                'allZonesAssigned'   => __('All zones have already been assigned to delivery rules.', 'schedulify-delivery'),
                'copySuccess'        => __('Configuration copied to all other shipping methods in this zone!', 'schedulify-delivery'),
                'enableMethod'       => __('Enable custom schedule rule for this method', 'schedulify-delivery'),
                'delayHours'         => __('Delivery Delay (in Hours)', 'schedulify-delivery'),
                'weeklyOffDays'      => __('Weekly Off-Days', 'schedulify-delivery'),
                'disabledRanges'     => __('Disabled Date Ranges', 'schedulify-delivery'),
                'blackoutDates'      => __('Blackout / Holiday Dates', 'schedulify-delivery'),
                'allowedDates'       => __('Allowed Delivery Dates (Exceptions)', 'schedulify-delivery'),
                'addDateRange'       => __('Add Date Range', 'schedulify-delivery'),
                'copyToAll'          => __('Copy Settings to All Methods', 'schedulify-delivery'),
                'hoursUnit'          => __('Hours', 'schedulify-delivery'),
                'sameDayHint'        => __('Earliest available delivery date based on (Current Time + Delay Hours). 0 = Same-Day allowed, 24 = Next Day, 48 = 2 Days Lead Time.', 'schedulify-delivery'),
                'noMethodsFound'     => __('No shipping methods found for the selected zone(s).', 'schedulify-delivery'),
                'loadingMethods'     => __('Loading shipping methods...', 'schedulify-delivery'),
            ]
        ];

        wp_localize_script('schedulify-admin-js', 'schedulifyAdminData', $localized_data);
    }

    /**
     * Get all Bangladesh Zones / Regions (64 standard zones)
     */
    public static function get_bangladesh_districts() {
        if (class_exists('WooCommerce') && function_exists('WC') && WC()->countries) {
            $states = WC()->countries->get_states('BD');
            if (!empty($states) && is_array($states)) {
                return $states;
            }
        }

        // Standard 64 Bangladesh Zones
        return [
            'BD-03' => 'Bogura (বগুড়া)',
            'BD-13' => 'Dhaka (ঢাকা)',
            'BD-10' => 'Chattogram (চট্টগ্রাম)',
            'BD-54' => 'Rajshahi (রাজশাহী)',
            'BD-27' => 'Khulna (খুলনা)',
            'BD-60' => 'Sylhet (সিলেট)',
            'BD-06' => 'Barishal (বরিশাল)',
            'BD-55' => 'Rangpur (রংপুর)',
            'BD-34' => 'Mymensingh (ময়মনসিংহ)',
            'BD-18' => 'Gazipur (গাজীপুর)',
            'BD-40' => 'Narayanganj (নারায়ণগঞ্জ)',
            'BD-08' => 'Cumilla (কুমিল্লা)',
            'BD-11' => 'Cox\'s Bazar (কক্সবাজার)',
            'BD-22' => 'Jashore (যশোর)',
            'BD-14' => 'Dinajpur (দিনাজপুর)',
            'BD-44' => 'Natore (নাটোর)',
            'BD-48' => 'Naogaon (নওগাঁ)',
            'BD-49' => 'Pabna (পাবনা)',
            'BD-59' => 'Sirajganj (সিরাজগঞ্জ)',
            'BD-24' => 'Joypurhat (জয়পুরহাট)',
            'BD-45' => 'Nawabganj (নবাবগঞ্জ)',
            'BD-63' => 'Tangail (টাঙ্গাইল)',
            'BD-15' => 'Faridpur (ফরিদপুর)',
            'BD-42' => 'Narsingdi (নরসিংদী)',
            'BD-33' => 'Manikganj (মানিকগঞ্জ)',
            'BD-35' => 'Munshiganj (মুন্সীগঞ্জ)',
            'BD-26' => 'Kishoreganj (কিশোরগঞ্জ)',
            'BD-21' => 'Jamalpur (জামালপুর)',
            'BD-41' => 'Netrokona (নেত্রকোণা)',
            'BD-57' => 'Sherpur (শেরপুর)',
            'BD-04' => 'Brahmanbaria (ব্রাহ্মণবাড়িয়া)',
            'BD-09' => 'Chandpur (চাঁদপুর)',
            'BD-16' => 'Feni (ফেনী)',
            'BD-31' => 'Lakshmipur (লক্ষ্মীপুর)',
            'BD-47' => 'Noakhali (নোয়াখালী)',
            'BD-29' => 'Khagrachhari (খাগড়াছড়ি)',
            'BD-56' => 'Rangamati (রাঙ্গামাটি)',
            'BD-01' => 'Bandarban (বান্দরবান)',
            'BD-20' => 'Habiganj (হবিগঞ্জ)',
            'BD-38' => 'Moulvibazar (মৌলভীবাজার)',
            'BD-61' => 'Sunamganj (সুনামগঞ্জ)',
            'BD-05' => 'Bagerhat (বাগেরহাট)',
            'BD-12' => 'Chuadanga (চুয়াডাঙ্গা)',
            'BD-23' => 'Jhenaidah (ঝিনাইদহ)',
            'BD-30' => 'Kushtia (কুষ্টিয়া)',
            'BD-37' => 'Magura (মাগুরা)',
            'BD-39' => 'Meherpur (মেহেরপুর)',
            'BD-43' => 'Narail (নড়াইল)',
            'BD-58' => 'Satkhira (সাতক্ষীরা)',
            'BD-02' => 'Barguna (বরগুনা)',
            'BD-07' => 'Bhola (ভোলা)',
            'BD-25' => 'Jhalokati (ঝালকাঠি)',
            'BD-51' => 'Patuakhali (পটুয়াখালী)',
            'BD-50' => 'Pirojpur (পিরোজপুর)',
            'BD-19' => 'Gaibandha (গাইবান্ধা)',
            'BD-28' => 'Kurigram (কুড়িগ্রাম)',
            'BD-32' => 'Lalmonirhat (লালমনিরহাট)',
            'BD-46' => 'Nilphamari (নীলফামারী)',
            'BD-52' => 'Panchagarh (পঞ্চগড়)',
            'BD-64' => 'Thakurgaon (ঠাকুরগাঁও)',
            'BD-17' => 'Gopalganj (গোপালগঞ্জ)',
            'BD-36' => 'Madaripur (মাদারীপুর)',
            'BD-53' => 'Rajbari (রাজবাড়ী)',
            'BD-62' => 'Shariatpur (শরীয়তপুর)',
        ];
    }

    /**
     * Get all active WooCommerce Shipping Methods dynamically from Shipping Zones
     */
    public static function get_all_woocommerce_shipping_methods() {
        $methods = [];

        if (class_exists('WC_Shipping_Zones')) {
            // 1. Fetch methods from configured Shipping Zones
            $zones = WC_Shipping_Zones::get_zones();
            foreach ($zones as $zone_data) {
                $zone_id = $zone_data['zone_id'] ?? 0;
                $zone_name = $zone_data['zone_name'] ?? '';
                $zone_shipping_methods = $zone_data['shipping_methods'] ?? [];
                $zone_locations = $zone_data['zone_locations'] ?? [];

                // If not preloaded, load via WC_Shipping_Zone
                if (empty($zone_shipping_methods)) {
                    $zone_obj = WC_Shipping_Zones::get_zone($zone_id);
                    if ($zone_obj) {
                        $zone_name = $zone_obj->get_zone_name();
                        $zone_shipping_methods = $zone_obj->get_shipping_methods(false);
                        $zone_locations = $zone_obj->get_zone_locations();
                    }
                }

                $state_codes = [];
                $has_country_wide = false;

                if (!empty($zone_locations) && is_array($zone_locations)) {
                    foreach ($zone_locations as $loc) {
                        $loc_code = is_object($loc) ? ($loc->code ?? '') : ($loc['code'] ?? '');
                        $loc_type = is_object($loc) ? ($loc->type ?? '') : ($loc['type'] ?? '');

                        if ($loc_type === 'state') {
                            $raw_code = trim($loc_code);
                            $state_codes[] = $raw_code;
                            $parts = explode(':', $raw_code);
                            $last_part = end($parts);
                            $state_codes[] = $last_part;
                            if (is_numeric($last_part)) {
                                $state_codes[] = 'BD-' . str_pad($last_part, 2, '0', STR_PAD_LEFT);
                            }
                        } elseif ($loc_type === 'country') {
                            if ($loc_code === 'BD') {
                                $has_country_wide = true;
                            }
                        }
                    }
                }
                $state_codes = array_values(array_unique(array_filter($state_codes)));

                if (!empty($zone_shipping_methods)) {
                    foreach ($zone_shipping_methods as $method) {
                        if (is_object($method) && isset($method->enabled) && $method->enabled === 'no') {
                            continue;
                        }
                        $m_id = is_object($method) ? $method->id : ($method['id'] ?? '');
                        $m_instance_id = is_object($method) ? $method->instance_id : ($method['instance_id'] ?? 0);
                        $unique_key = $m_id . ':' . $m_instance_id;
                        $title = is_object($method) ? $method->get_title() : ($method['title'] ?? ucfirst(str_replace('_', ' ', $m_id)));

                        $methods[$unique_key] = [
                            'id'          => $unique_key,
                            'method_id'   => $m_id,
                            'instance_id' => $m_instance_id,
                            'title'       => $title,
                            'zone_id'     => $zone_id,
                            'zone_name'   => $zone_name,
                            'states'      => $state_codes,
                            'is_country'  => $has_country_wide,
                            'is_default'  => false,
                            'label'       => sprintf('%s (%s)', $title, $zone_name),
                        ];
                    }
                }
            }

            // 2. Fetch methods from Default Zone (Zone 0 / Rest of the World)
            $default_zone = WC_Shipping_Zones::get_zone(0);
            if ($default_zone) {
                $default_methods = $default_zone->get_shipping_methods(false);
                foreach ($default_methods as $method) {
                    if (is_object($method) && isset($method->enabled) && $method->enabled === 'no') {
                        continue;
                    }
                    $unique_key = $method->id . ':' . $method->instance_id;
                    $title = $method->get_title();
                    $methods[$unique_key] = [
                        'id'          => $unique_key,
                        'method_id'   => $method->id,
                        'instance_id' => $method->instance_id,
                        'title'       => $title,
                        'zone_id'     => 0,
                        'zone_name'   => __('Rest of the world', 'schedulify-delivery'),
                        'states'      => [],
                        'is_country'  => true,
                        'is_default'  => true,
                        'label'       => sprintf('%s (%s)', $title, __('Rest of the world', 'schedulify-delivery')),
                    ];
                }
            }
        }

        // 3. Guaranteed Direct Database Query Fallback if WC API returns empty
        if (empty($methods)) {
            global $wpdb;
            $zm_table  = $wpdb->prefix . 'woocommerce_shipping_zone_methods';
            $z_table   = $wpdb->prefix . 'woocommerce_shipping_zones';
            $loc_table = $wpdb->prefix . 'woocommerce_shipping_zone_locations';

            $check_table = $wpdb->get_var("SHOW TABLES LIKE '{$zm_table}'");
            if ($check_table === $zm_table) {
                $rows = $wpdb->get_results("
                    SELECT zm.zone_id, zm.instance_id, zm.method_id, zm.is_enabled, z.zone_name
                    FROM {$zm_table} zm
                    LEFT JOIN {$z_table} z ON zm.zone_id = z.zone_id
                    WHERE zm.is_enabled = 1
                    ORDER BY zm.zone_id ASC, zm.method_order ASC
                ");

                if (!empty($rows)) {
                    foreach ($rows as $row) {
                        $z_id = intval($row->zone_id);
                        $inst_id = intval($row->instance_id);
                        $m_id = $row->method_id;
                        $unique_key = $m_id . ':' . $inst_id;
                        $zone_name = ($z_id === 0) ? __('Rest of the world', 'schedulify-delivery') : (!empty($row->zone_name) ? $row->zone_name : ('Zone ' . $z_id));

                        // Fetch method title from wp_options
                        $opt = get_option('woocommerce_' . $m_id . '_' . $inst_id . '_settings', []);
                        $title = !empty($opt['title']) ? $opt['title'] : ucfirst(str_replace('_', ' ', $m_id));

                        // Fetch locations for zone
                        $loc_rows = $wpdb->get_results($wpdb->prepare("
                            SELECT location_code, location_type
                            FROM {$loc_table}
                            WHERE zone_id = %d
                        ", $z_id));

                        $state_codes = [];
                        $has_country_wide = false;
                        if (!empty($loc_rows)) {
                            foreach ($loc_rows as $lrow) {
                                if ($lrow->location_type === 'state') {
                                    $raw_code = trim($lrow->location_code);
                                    $state_codes[] = $raw_code;
                                    $parts = explode(':', $raw_code);
                                    $last_part = end($parts);
                                    $state_codes[] = $last_part;
                                    if (is_numeric($last_part)) {
                                        $state_codes[] = 'BD-' . str_pad($last_part, 2, '0', STR_PAD_LEFT);
                                    }
                                } elseif ($lrow->location_type === 'country' && $lrow->location_code === 'BD') {
                                    $has_country_wide = true;
                                }
                            }
                        }

                        $methods[$unique_key] = [
                            'id'          => $unique_key,
                            'method_id'   => $m_id,
                            'instance_id' => $inst_id,
                            'title'       => $title,
                            'zone_id'     => $z_id,
                            'zone_name'   => $zone_name,
                            'states'      => array_values(array_unique(array_filter($state_codes))),
                            'is_country'  => $has_country_wide,
                            'is_default'  => ($z_id === 0),
                            'label'       => sprintf('%s (%s)', $title, $zone_name),
                        ];
                    }
                }
            }
        }

        // 4. Fallback to registered shipping classes
        if (empty($methods) && function_exists('WC') && WC()->shipping()) {
            $registered = WC()->shipping()->get_shipping_methods();
            foreach ($registered as $m_id => $m_obj) {
                $methods[$m_id] = [
                    'id'          => $m_id,
                    'method_id'   => $m_id,
                    'instance_id' => 0,
                    'title'       => $m_obj->get_method_title(),
                    'zone_id'     => '',
                    'zone_name'   => __('General', 'schedulify-delivery'),
                    'states'      => [],
                    'is_country'  => true,
                    'is_default'  => true,
                    'label'       => $m_obj->get_method_title(),
                ];
            }
        }

        return $methods;
    }

    /**
     * AJAX endpoint to fetch shipping methods matching selected zones
     */
    public function ajax_get_shipping_methods_by_zones() {
        check_ajax_referer('schedulify_admin_nonce', 'nonce');

        if (!current_user_can('manage_woocommerce')) {
            wp_send_json_error(['message' => __('Permission denied.', 'schedulify-delivery')]);
        }

        $raw_zones = isset($_POST['zones']) ? (array)$_POST['zones'] : [];
        $selected_codes = array_map('sanitize_text_field', $raw_zones);
        $selected_codes = array_values(array_filter($selected_codes));
        $current_method = isset($_POST['current_method']) ? sanitize_text_field($_POST['current_method']) : '';

        $all_methods = self::get_all_woocommerce_shipping_methods();

        if (empty($all_methods)) {
            wp_send_json_success([
                'methods' => []
            ]);
        }

        // If no zones selected, return empty
        if (empty($selected_codes)) {
            wp_send_json_success([
                'methods' => []
            ]);
        }

        $all_districts = self::get_bangladesh_districts();
        $final_methods = [];

        // For each selected district, find its exact matching WooCommerce zone methods
        foreach ($selected_codes as $dcode) {
            $clean_code = strtolower(trim($dcode));
            $num = preg_replace('/[^0-9]/', '', $clean_code);
            $possible_codes = [$clean_code];
            if ($num) {
                $possible_codes[] = $num;
                $possible_codes[] = 'bd-' . $num;
                $possible_codes[] = 'bd:' . $num;
                $possible_codes[] = 'bd:bd-' . $num;
            }
            $possible_codes = array_unique($possible_codes);

            $district_name = '';
            if (isset($all_districts[$dcode])) {
                $parts = explode('(', strtolower(trim($all_districts[$dcode])));
                $district_name = trim($parts[0]);
            }

            $district_matched_methods = [];
            $country_methods = [];
            $default_methods = [];

            foreach ($all_methods as $key => $method) {
                $states = !empty($method['states']) ? array_map('strtolower', (array)$method['states']) : [];
                $zone_name = strtolower(trim($method['zone_name'] ?? ''));
                $is_default = !empty($method['is_default']) || (isset($method['zone_id']) && $method['zone_id'] === 0);
                $is_country = !empty($method['is_country']);

                // 1. Direct state code match
                $state_match = false;
                if (!empty($states)) {
                    foreach ($possible_codes as $pcode) {
                        if (in_array($pcode, $states, true)) {
                            $state_match = true;
                            break;
                        }
                    }
                }

                // 2. Zone name exact match (ONLY if the shipping zone has NO specific states configured, to avoid matching 'Outside Bogura' for 'Bogura')
                $name_match = false;
                if (!$state_match && empty($states) && !empty($zone_name) && !empty($district_name) && !$is_default) {
                    if ($zone_name === $district_name) {
                        $name_match = true;
                    }
                }

                if ($state_match || $name_match) {
                    $district_matched_methods[$key] = $method;
                } elseif ($is_country && empty($states)) {
                    $country_methods[$key] = $method;
                } elseif ($is_default) {
                    $default_methods[$key] = $method;
                }
            }

            // In WooCommerce zone resolution:
            // If a specific zone matched this district, use ONLY that zone's methods.
            // If no specific zone matched, fall back to country-wide zone or Rest of the World (Zone 0).
            if (!empty($district_matched_methods)) {
                foreach ($district_matched_methods as $k => $m) {
                    $final_methods[$k] = $m;
                }
            } elseif (!empty($country_methods)) {
                foreach ($country_methods as $k => $m) {
                    $final_methods[$k] = $m;
                }
            } elseif (!empty($default_methods)) {
                foreach ($default_methods as $k => $m) {
                    $final_methods[$k] = $m;
                }
            }
        }

        // If editing an existing rule and current_method exists in all_methods, ensure it is preserved
        if (!empty($current_method) && isset($all_methods[$current_method])) {
            $final_methods[$current_method] = $all_methods[$current_method];
        }

        // If for any reason no methods resolved (e.g. no shipping zones configured at all), fallback to all_methods
        if (empty($final_methods)) {
            $final_methods = $all_methods;
        }

        // Also fetch any existing rules that apply to any of the selected zones
        $all_zone_rules = class_exists('Schedulify_DB') ? Schedulify_DB::get_zone_rules() : [];
        $existing_rules = [];
        foreach ($all_zone_rules as $rule) {
            $rule_districts = (array)($rule['districts'] ?? []);
            if (!empty(array_intersect($selected_codes, $rule_districts))) {
                if (!empty($rule['methods']) && is_array($rule['methods'])) {
                    foreach ($rule['methods'] as $mk => $mconf) {
                        $existing_rules[$mk] = $mconf;
                    }
                }
                $m_key = $rule['shipping_method_id'] ?? 'all';
                if (!isset($existing_rules[$m_key])) {
                    $existing_rules[$m_key] = $rule;
                }
            }
        }

        wp_send_json_success([
            'methods'        => array_values($final_methods),
            'existing_rules' => $existing_rules,
        ]);
    }

    /**
     * Handle form actions (Save General, Save Zone Rule, Delete Zone Rule)
     */
    public function handle_form_actions() {
        if (!current_user_can('manage_woocommerce')) {
            return;
        }

        // 1. Save General Settings
        if (isset($_POST['schedulify_save_general_settings'])) {
            check_admin_referer('schedulify_general_settings_nonce_action', 'schedulify_general_settings_nonce');

            // Disabled Date Ranges
            $disabled_ranges = [];
            if (isset($_POST['disabled_date_ranges']) && is_array($_POST['disabled_date_ranges'])) {
                foreach ($_POST['disabled_date_ranges'] as $range) {
                    $start  = sanitize_text_field($range['start'] ?? '');
                    $end    = sanitize_text_field($range['end'] ?? '');
                    $reason = sanitize_text_field($range['reason'] ?? '');
                    if (!empty($start) && !empty($end)) {
                        if ($start > $end) {
                            $temp  = $start;
                            $start = $end;
                            $end   = $temp;
                        }
                        $disabled_ranges[] = [
                            'start'  => $start,
                            'end'    => $end,
                            'reason' => $reason,
                        ];
                    }
                }
            }

            $general_data = [
                'delay_hours'          => isset($_POST['delay_hours']) ? max(0, intval($_POST['delay_hours'])) : 0,
                'off_days'             => isset($_POST['off_days']) && is_array($_POST['off_days']) ? array_map('absint', $_POST['off_days']) : [],
                'blackout_dates'       => sanitize_textarea_field($_POST['blackout_dates'] ?? ''),
                'allowed_dates'        => sanitize_textarea_field($_POST['allowed_dates'] ?? ''),
                'disabled_date_ranges' => $disabled_ranges,
            ];

            if (class_exists('Schedulify_DB')) {
                Schedulify_DB::save_general_settings($general_data);
            } elseif (class_exists('schedulify_DB')) {
                schedulify_DB::save_general_settings($general_data);
            }

            add_settings_error('schedulify_messages', 'schedulify_message', __('General Settings Saved Successfully!', 'schedulify-delivery'), 'updated');
            return;
        }

        // 2. Save / Update Zone Rule
        if (isset($_POST['schedulify_save_zone_rule'])) {
            check_admin_referer('schedulify_zone_rule_nonce_action', 'schedulify_zone_rule_nonce');

            $districts = isset($_POST['districts']) && is_array($_POST['districts']) ? array_map('sanitize_text_field', $_POST['districts']) : [];

            if (empty($districts)) {
                add_settings_error('schedulify_messages', 'schedulify_error', __('Please select at least one zone.', 'schedulify-delivery'), 'error');
                return;
            }

            $rule_id = !empty($_POST['rule_id']) ? sanitize_text_field($_POST['rule_id']) : ('rule_' . uniqid());
            $saved_count = 0;

            // Check if submitted via multi-method tabs format
            if (isset($_POST['methods']) && is_array($_POST['methods'])) {
                $configured_methods = [];

                foreach ($_POST['methods'] as $m_key => $m_data) {
                    $delay_str = isset($m_data['delay_hours']) ? trim($m_data['delay_hours']) : '';

                    if ($delay_str !== '') {
                        $shipping_method_id = sanitize_text_field($m_key);
                        $shipping_method_title = !empty($m_data['shipping_method_title']) ? sanitize_text_field($m_data['shipping_method_title']) : '';
                        $delay_hours = max(0, intval($delay_str));
                        $off_days = isset($m_data['off_days']) && is_array($m_data['off_days']) ? array_map('absint', $m_data['off_days']) : [];
                        $blackout_dates = sanitize_textarea_field($m_data['blackout_dates'] ?? '');
                        $allowed_dates = sanitize_textarea_field($m_data['allowed_dates'] ?? '');

                        // Zone Disabled Date Ranges for this method
                        $disabled_ranges = [];
                        if (isset($m_data['disabled_date_ranges']) && is_array($m_data['disabled_date_ranges'])) {
                            foreach ($m_data['disabled_date_ranges'] as $range) {
                                $start  = sanitize_text_field($range['start'] ?? '');
                                $end    = sanitize_text_field($range['end'] ?? '');
                                $reason = sanitize_text_field($range['reason'] ?? '');
                                if (!empty($start) && !empty($end)) {
                                    if ($start > $end) {
                                        $temp  = $start;
                                        $start = $end;
                                        $end   = $temp;
                                    }
                                    $disabled_ranges[] = [
                                        'start'  => $start,
                                        'end'    => $end,
                                        'reason' => $reason,
                                    ];
                                }
                            }
                        }

                        $configured_methods[$shipping_method_id] = [
                            'shipping_method_id'    => $shipping_method_id,
                            'shipping_method_title' => $shipping_method_title,
                            'delay_hours'           => $delay_hours,
                            'off_days'              => $off_days,
                            'disabled_date_ranges'  => $disabled_ranges,
                            'blackout_dates'        => $blackout_dates,
                            'allowed_dates'         => $allowed_dates,
                        ];
                    }
                }

                if (!empty($configured_methods)) {
                    $first_m = reset($configured_methods);
                    $new_rule = [
                        'id'                    => $rule_id,
                        'shipping_method_id'    => count($configured_methods) === 1 ? $first_m['shipping_method_id'] : 'multiple',
                        'shipping_method_title' => count($configured_methods) === 1 ? $first_m['shipping_method_title'] : '',
                        'districts'             => array_values($districts),
                        'delay_hours'           => $first_m['delay_hours'] ?? 0,
                        'off_days'              => $first_m['off_days'] ?? [],
                        'disabled_date_ranges'  => $first_m['disabled_date_ranges'] ?? [],
                        'blackout_dates'        => $first_m['blackout_dates'] ?? '',
                        'allowed_dates'         => $first_m['allowed_dates'] ?? '',
                        'methods'               => $configured_methods,
                    ];

                    if (class_exists('Schedulify_DB')) {
                        Schedulify_DB::save_zone_rule($new_rule);
                    }
                    $saved_count = 1;
                }
            } elseif (isset($_POST['delay_hours'])) {
                // Fallback single rule format
                $shipping_method_id    = !empty($_POST['shipping_method_id']) ? sanitize_text_field($_POST['shipping_method_id']) : 'all';
                $shipping_method_title = !empty($_POST['shipping_method_title']) ? sanitize_text_field($_POST['shipping_method_title']) : '';
                $delay_hours           = max(0, intval($_POST['delay_hours']));
                $off_days              = isset($_POST['zone_off_days']) && is_array($_POST['zone_off_days']) ? array_map('absint', $_POST['zone_off_days']) : [];
                $blackout_dates        = sanitize_textarea_field($_POST['zone_blackout_dates'] ?? '');
                $allowed_dates         = sanitize_textarea_field($_POST['zone_allowed_dates'] ?? '');

                $disabled_ranges = [];
                if (isset($_POST['zone_disabled_date_ranges']) && is_array($_POST['zone_disabled_date_ranges'])) {
                    foreach ($_POST['zone_disabled_date_ranges'] as $range) {
                        $start  = sanitize_text_field($range['start'] ?? '');
                        $end    = sanitize_text_field($range['end'] ?? '');
                        $reason = sanitize_text_field($range['reason'] ?? '');
                        if (!empty($start) && !empty($end)) {
                            if ($start > $end) {
                                $temp  = $start;
                                $start = $end;
                                $end   = $temp;
                            }
                            $disabled_ranges[] = [
                                'start'  => $start,
                                'end'    => $end,
                                'reason' => $reason,
                            ];
                        }
                    }
                }

                $new_rule = [
                    'id'                    => $rule_id,
                    'shipping_method_id'    => $shipping_method_id,
                    'shipping_method_title' => $shipping_method_title,
                    'districts'             => array_values($districts),
                    'delay_hours'           => $delay_hours,
                    'off_days'              => $off_days,
                    'disabled_date_ranges'  => $disabled_ranges,
                    'blackout_dates'        => $blackout_dates,
                    'allowed_dates'         => $allowed_dates,
                    'methods'               => [
                        $shipping_method_id => [
                            'shipping_method_id'    => $shipping_method_id,
                            'shipping_method_title' => $shipping_method_title,
                            'delay_hours'           => $delay_hours,
                            'off_days'              => $off_days,
                            'disabled_date_ranges'  => $disabled_ranges,
                            'blackout_dates'        => $blackout_dates,
                            'allowed_dates'         => $allowed_dates,
                        ]
                    ]
                ];

                if (class_exists('Schedulify_DB')) {
                    Schedulify_DB::save_zone_rule($new_rule);
                }
                $saved_count = 1;
            }

            if ($saved_count > 0) {
                add_settings_error('schedulify_messages', 'schedulify_message', __('Zone Delivery Rule Saved Successfully!', 'schedulify-delivery'), 'updated');
            } else {
                add_settings_error('schedulify_messages', 'schedulify_error', __('Please configure at least one shipping method with valid delay hours.', 'schedulify-delivery'), 'error');
            }

            wp_safe_redirect(add_query_arg(['page' => 'schedulify-delivery', 'tab' => 'zones'], admin_url('admin.php')));
            exit;
        }

        // 3. Delete Zone Rule
        if (isset($_GET['action']) && 'delete_zone_rule' === $_GET['action'] && !empty($_GET['rule_id'])) {
            if (isset($_GET['_wpnonce'])) {
                check_admin_referer('schedulify_delete_zone_rule_' . $_GET['rule_id']);
            }

            $rule_id = sanitize_text_field($_GET['rule_id']);
            if (class_exists('Schedulify_DB')) {
                Schedulify_DB::delete_zone_rule($rule_id);
            } elseif (class_exists('schedulify_DB')) {
                schedulify_DB::delete_zone_rule($rule_id);
            }

            add_settings_error('schedulify_messages', 'schedulify_message', __('Zone Rule Deleted Successfully!', 'schedulify-delivery'), 'updated');
            wp_safe_redirect(add_query_arg(['page' => 'schedulify-delivery', 'tab' => 'zones'], admin_url('admin.php')));
            exit;
        }
    }

    public function render_settings_page() {
        $s = self::get_settings();
        $current_tab = isset($_GET['tab']) && 'zones' === $_GET['tab'] ? 'zones' : 'general';
        $all_districts = self::get_bangladesh_districts();
        $zone_rules = (array)($s['zone_rules'] ?? []);

        $days_of_week = [
            0 => __('Sunday (রবিবার)', 'schedulify-delivery'),
            1 => __('Monday (সোমবার)', 'schedulify-delivery'),
            2 => __('Tuesday (মঙ্গলবার)', 'schedulify-delivery'),
            3 => __('Wednesday (বুধবার)', 'schedulify-delivery'),
            4 => __('Thursday (বৃহস্পতিবার)', 'schedulify-delivery'),
            5 => __('Friday (শুক্রবার)', 'schedulify-delivery'),
            6 => __('Saturday (শনিবার)', 'schedulify-delivery'),
        ];
        ?>
        <div class="wrap schedulify-settings-wrap">

            <h1 class="wp-heading-inline">
                <?php _e('Schedulify Delivery', 'schedulify-delivery'); ?>
            </h1>
            <hr class="wp-header-end">

            <?php settings_errors('schedulify_messages'); ?>

            <!-- Native WP Tab Navigation -->
            <div class="schedulify-tabs-container">
                <ul class="schedulify-nav-tabs">
                    <li class="<?php echo $current_tab === 'general' ? 'active' : ''; ?>" data-tab="general">
                        <span class="dashicons dashicons-admin-generic"></span>
                        <?php _e('General Settings', 'schedulify-delivery'); ?>
                    </li>
                    <li class="<?php echo $current_tab === 'zones' ? 'active' : ''; ?>" data-tab="zones">
                        <span class="dashicons dashicons-location-alt"></span>
                        <?php _e('Zone Settings', 'schedulify-delivery'); ?>
                        <?php if (!empty($zone_rules)) : ?>
                            <span class="schedulify-badge-count"><?php echo count($zone_rules); ?></span>
                        <?php endif; ?>
                    </li>
                </ul>

                <!-- TAB 1: GENERAL SETTINGS -->
                <div class="schedulify-tab-content <?php echo $current_tab === 'general' ? 'active' : ''; ?>" id="schedulify-tab-general">
                    <form method="post" action="">
                        <?php wp_nonce_field('schedulify_general_settings_nonce_action', 'schedulify_general_settings_nonce'); ?>

                        <table class="form-table" role="presentation">
                            <tr>
                                <th scope="row">
                                    <label for="schedulify_general_delay_hours"><?php _e('Default Delivery Delay (in Hours)', 'schedulify-delivery'); ?></label>
                                </th>
                                <td>
                                    <div class="schedulify-delay-input-group">
                                        <input type="number"
                                               id="schedulify_general_delay_hours"
                                               name="delay_hours"
                                               class="small-text"
                                               min="0"
                                               step="1"
                                               value="<?php echo esc_attr(isset($s['delay_hours']) ? intval($s['delay_hours']) : 0); ?>">
                                        <span class="schedulify-input-unit"><?php _e('Hours', 'schedulify-delivery'); ?></span>
                                    </div>
                                    <p class="description"><?php _e('Global default delivery delay in hours applied to any zone without a custom rule. (0 = Same-Day, 24 = Next Day, 48 = 2 Days Lead Time).', 'schedulify-delivery'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><?php _e('Weekly Off-Days', 'schedulify-delivery'); ?></th>
                                <td>
                                    <fieldset class="schedulify-checkbox-grid">
                                        <?php foreach ($days_of_week as $idx => $label) : ?>
                                            <label class="schedulify-checkbox-item">
                                                <input type="checkbox" name="off_days[]" value="<?php echo esc_attr($idx); ?>" <?php checked(in_array($idx, (array)$s['off_days']), true); ?>>
                                                <?php echo esc_html($label); ?>
                                            </label>
                                        <?php endforeach; ?>
                                    </fieldset>
                                    <p class="description"><?php _e('Selected days will be disabled as global off-days in the delivery calendar.', 'schedulify-delivery'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><?php _e('Disabled Date Ranges', 'schedulify-delivery'); ?></th>
                                <td>
                                    <div class="schedulify-ranges-container" id="schedulify-general-disabled-ranges">
                                        <div class="schedulify-ranges-list">
                                            <?php
                                            $saved_ranges = (array)($s['disabled_date_ranges'] ?? []);
                                            foreach ($saved_ranges as $i => $range) :
                                            ?>
                                                <div class="schedulify-range-row">
                                                    <div class="schedulify-range-field">
                                                        <label><?php _e('From:', 'schedulify-delivery'); ?></label>
                                                        <input type="date" name="disabled_date_ranges[<?php echo esc_attr($i); ?>][start]" value="<?php echo esc_attr($range['start'] ?? ''); ?>" required>
                                                    </div>
                                                    <div class="schedulify-range-field">
                                                        <label><?php _e('To:', 'schedulify-delivery'); ?></label>
                                                        <input type="date" name="disabled_date_ranges[<?php echo esc_attr($i); ?>][end]" value="<?php echo esc_attr($range['end'] ?? ''); ?>" required>
                                                    </div>
                                                    <div class="schedulify-range-field schedulify-range-reason">
                                                        <label><?php _e('Reason (Optional):', 'schedulify-delivery'); ?></label>
                                                        <input type="text" name="disabled_date_ranges[<?php echo esc_attr($i); ?>][reason]" value="<?php echo esc_attr($range['reason'] ?? ''); ?>" placeholder="<?php esc_attr_e('e.g. Eid Vacation', 'schedulify-delivery'); ?>">
                                                    </div>
                                                    <button type="button" class="button schedulify-remove-range" title="<?php esc_attr_e('Delete Range', 'schedulify-delivery'); ?>">
                                                        <span class="dashicons dashicons-trash"></span>
                                                    </button>
                                                </div>
                                            <?php endforeach; ?>
                                        </div>
                                        <button type="button" class="button schedulify-add-range">
                                            <span class="dashicons dashicons-plus-alt2"></span> <?php _e('Add Date Range', 'schedulify-delivery'); ?>
                                        </button>
                                        <p class="description"><?php _e('Block all delivery dates between the specified From and To dates (inclusive).', 'schedulify-delivery'); ?></p>
                                    </div>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">
                                    <label for="schedulify_blackout_dates"><?php _e('Blackout / Holiday Dates', 'schedulify-delivery'); ?></label>
                                </th>
                                <td>
                                    <textarea id="schedulify_blackout_dates" name="blackout_dates" rows="3" class="large-text code" placeholder="2026-12-16, 2026-12-25, 2026-03-26"><?php echo esc_textarea($s['blackout_dates'] ?? ''); ?></textarea>
                                    <p class="description"><?php _e('Comma or newline separated holiday/blackout dates (YYYY-MM-DD) when delivery is not available.', 'schedulify-delivery'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row">
                                    <label for="schedulify_allowed_dates"><?php _e('Allowed Dates (Exceptions)', 'schedulify-delivery'); ?></label>
                                </th>
                                <td>
                                    <textarea id="schedulify_allowed_dates" name="allowed_dates" rows="2" class="large-text code" placeholder="2026-03-15, 2026-03-30"><?php echo esc_textarea($s['allowed_dates'] ?? ''); ?></textarea>
                                    <p class="description"><?php _e('Comma or newline separated dates (YYYY-MM-DD) that are always open regardless of off-days.', 'schedulify-delivery'); ?></p>
                                </td>
                            </tr>
                        </table>

                        <div class="schedulify-footer-actions">
                            <button type="submit" name="schedulify_save_general_settings" class="button button-primary">
                                <?php _e('Save Changes', 'schedulify-delivery'); ?>
                            </button>
                        </div>
                    </form>
                </div>

                <!-- TAB 2: ZONE SETTINGS -->
                <div class="schedulify-tab-content <?php echo $current_tab === 'zones' ? 'active' : ''; ?>" id="schedulify-tab-zones">

                    <div class="schedulify-zone-header-bar">
                        <div>
                            <h3><?php _e('Configured Zone Delivery Rules', 'schedulify-delivery'); ?></h3>
                            <p class="description"><?php _e('Define custom delivery matrix rules for specific Bangladesh zones.', 'schedulify-delivery'); ?></p>
                        </div>
                        <button type="button" class="button button-primary schedulify-open-zone-modal" id="schedulify-btn-add-zone">
                            <span class="dashicons dashicons-plus-alt"></span> <?php _e('Add Zone Rule', 'schedulify-delivery'); ?>
                        </button>
                    </div>

                    <?php if (empty($zone_rules)) : ?>
                        <div class="schedulify-empty-state">
                            <span class="dashicons dashicons-location"></span>
                            <h4><?php _e('No Zone Rules Configured Yet', 'schedulify-delivery'); ?></h4>
                            <p><?php printf(
                                __('All zones are using General Settings defaults (%d hours delay). Click "Add Zone Rule" to configure custom rules for specific zones.', 'schedulify-delivery'),
                                intval($s['delay_hours'] ?? 0)
                            ); ?></p>
                            <button type="button" class="button button-secondary schedulify-open-zone-modal">
                                <?php _e('+ Configure Your First Zone Rule', 'schedulify-delivery'); ?>
                            </button>
                        </div>
                    <?php else : ?>
                        <div class="schedulify-table-responsive">
                            <table class="wp-list-table widefat fixed striped schedulify-zone-table">
                                <thead>
                                    <tr>
                                        <th scope="col" style="width:26%"><?php _e('Assigned Zones', 'schedulify-delivery'); ?></th>
                                        <th scope="col" style="width:22%"><?php _e('Shipping Method', 'schedulify-delivery'); ?></th>
                                        <th scope="col" style="width:18%"><?php _e('Delivery Delay', 'schedulify-delivery'); ?></th>
                                        <th scope="col" style="width:16%"><?php _e('Weekly Off-Days', 'schedulify-delivery'); ?></th>
                                        <th scope="col" style="width:12%"><?php _e('Blackout / Ranges', 'schedulify-delivery'); ?></th>
                                        <th scope="col" style="width:6%; text-align:right"><?php _e('Actions', 'schedulify-delivery'); ?></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <?php
                                    $shipping_methods = self::get_all_woocommerce_shipping_methods();
                                    $day_short = [0 => 'Sun', 1 => 'Mon', 2 => 'Tue', 3 => 'Wed', 4 => 'Thu', 5 => 'Fri', 6 => 'Sat'];

                                    foreach ($zone_rules as $rule) :
                                        $r_id = $rule['id'] ?? '';
                                        $r_districts = (array)($rule['districts'] ?? []);
                                        $rule_methods = !empty($rule['methods']) && is_array($rule['methods']) ? $rule['methods'] : [];

                                        if (empty($rule_methods)) {
                                            $m_key = $rule['shipping_method_id'] ?? 'all';
                                            $rule_methods[$m_key] = [
                                                'shipping_method_id'    => $m_key,
                                                'shipping_method_title' => !empty($rule['shipping_method_title']) ? $rule['shipping_method_title'] : ($shipping_methods[$m_key]['title'] ?? $m_key),
                                                'delay_hours'           => intval($rule['delay_hours'] ?? 0),
                                                'off_days'              => (array)($rule['off_days'] ?? []),
                                                'disabled_date_ranges'  => (array)($rule['disabled_date_ranges'] ?? []),
                                                'blackout_dates'        => $rule['blackout_dates'] ?? '',
                                                'allowed_dates'         => $rule['allowed_dates'] ?? '',
                                            ];
                                        }

                                        $district_names = [];
                                        foreach ($r_districts as $dcode) {
                                            $district_names[] = $all_districts[$dcode] ?? $dcode;
                                        }

                                        $delete_url = wp_nonce_url(
                                            add_query_arg(['page' => 'schedulify-delivery', 'tab' => 'zones', 'action' => 'delete_zone_rule', 'rule_id' => $r_id], admin_url('admin.php')),
                                            'schedulify_delete_zone_rule_' . $r_id
                                        );
                                    ?>
                                        <tr data-rule-json="<?php echo esc_attr(wp_json_encode($rule)); ?>">
                                            <td>
                                                <strong><?php echo esc_html(implode(', ', array_slice($district_names, 0, 5))); ?></strong>
                                                <?php if (count($district_names) > 5) : ?>
                                                    <span class="schedulify-badge-count">+<?php echo count($district_names) - 5; ?></span>
                                                <?php endif; ?>
                                                <div class="row-actions">
                                                    <span class="edit"><a href="#" class="schedulify-edit-rule"><?php _e('Edit', 'schedulify-delivery'); ?></a> | </span>
                                                    <span class="delete">
                                                        <a href="<?php echo esc_url($delete_url); ?>" class="schedulify-delete-rule" style="color:#b32d2e"><?php _e('Delete', 'schedulify-delivery'); ?></a>
                                                    </span>
                                                </div>
                                            </td>
                                            <td>
                                                <div class="schedulify-cell-methods-list">
                                                    <?php foreach ($rule_methods as $m_conf) :
                                                        $m_title = !empty($m_conf['shipping_method_title']) ? $m_conf['shipping_method_title'] : ($shipping_methods[$m_conf['shipping_method_id']]['title'] ?? $m_conf['shipping_method_id']);
                                                    ?>
                                                        <div class="schedulify-cell-method-item">
                                                            <span class="schedulify-badge-method"><?php echo esc_html($m_title); ?></span>
                                                        </div>
                                                    <?php endforeach; ?>
                                                </div>
                                            </td>
                                            <td>
                                                <div class="schedulify-cell-delays-list">
                                                    <?php foreach ($rule_methods as $m_conf) :
                                                        $m_delay = intval($m_conf['delay_hours'] ?? 0);
                                                    ?>
                                                        <div class="schedulify-cell-delay-item">
                                                            <span class="schedulify-delay-badge <?php echo $m_delay === 0 ? 'same-day' : ''; ?>">
                                                                <span class="dashicons dashicons-clock"></span>
                                                                <?php
                                                                echo esc_html(sprintf(
                                                                    _n('%d Hour', '%d Hours', $m_delay, 'schedulify-delivery'),
                                                                    $m_delay
                                                                ));
                                                                ?>
                                                            </span>
                                                        </div>
                                                    <?php endforeach; ?>
                                                </div>
                                            </td>
                                            <td>
                                                <div class="schedulify-cell-offdays-list">
                                                    <?php foreach ($rule_methods as $m_conf) :
                                                        $m_off_days = (array)($m_conf['off_days'] ?? []);
                                                    ?>
                                                        <div class="schedulify-cell-offday-item">
                                                            <?php
                                                            if (empty($m_off_days)) {
                                                                echo '<span class="schedulify-text-muted">' . __('Open 7 days', 'schedulify-delivery') . '</span>';
                                                            } else {
                                                                $off_labels = [];
                                                                foreach ($m_off_days as $d) {
                                                                    $off_labels[] = $day_short[$d] ?? $d;
                                                                }
                                                                echo '<span class="schedulify-badge-off">' . esc_html(implode(', ', $off_labels)) . '</span>';
                                                            }
                                                            ?>
                                                        </div>
                                                    <?php endforeach; ?>
                                                </div>
                                            </td>
                                            <td>
                                                <div class="schedulify-cell-blackouts-list">
                                                    <?php foreach ($rule_methods as $m_conf) :
                                                        $m_blackout = trim($m_conf['blackout_dates'] ?? '');
                                                        $m_ranges_count = count((array)($m_conf['disabled_date_ranges'] ?? []));
                                                        $details = [];
                                                        if (!empty($m_blackout)) {
                                                            $b_count = count(array_filter(preg_split('/[\r\n,]+/', $m_blackout)));
                                                            $details[] = sprintf(_n('%d Blackout', '%d Blackouts', $b_count, 'schedulify-delivery'), $b_count);
                                                        }
                                                        if ($m_ranges_count > 0) {
                                                            $details[] = sprintf(_n('%d Range', '%d Ranges', $m_ranges_count, 'schedulify-delivery'), $m_ranges_count);
                                                        }
                                                    ?>
                                                        <div class="schedulify-cell-blackout-item">
                                                            <?php echo empty($details) ? '<span class="schedulify-text-muted">—</span>' : esc_html(implode(' • ', $details)); ?>
                                                        </div>
                                                    <?php endforeach; ?>
                                                </div>
                                            </td>
                                            <td style="text-align:right; white-space:nowrap">
                                                <button type="button" class="button button-small schedulify-edit-rule">
                                                    <span class="dashicons dashicons-edit" style="margin-top:3px;font-size:14px;width:14px;height:14px;"></span> <?php _e('Edit', 'schedulify-delivery'); ?>
                                                </button>
                                            </td>
                                        </tr>
                                    <?php endforeach; ?>
                                </tbody>
                            </table>
                        </div>
                    <?php endif; ?>

                </div><!-- /zone tab -->
            </div><!-- /tabs container -->

        </div><!-- /wrap -->

        <!-- ZONE RULE MULTI-STEP MODAL -->
        <div id="schedulify-zone-modal" class="schedulify-modal-backdrop" style="display:none;">
            <div class="schedulify-modal-container">

                <div class="schedulify-modal-header">
                    <div class="schedulify-modal-title-area">
                        <h2 id="schedulify-modal-title"><?php _e('Add Zone Delivery Rule', 'schedulify-delivery'); ?></h2>
                        <div class="schedulify-step-indicator">
                            <span class="schedulify-step-dot active" data-step="1">1. <?php _e('Select Zones', 'schedulify-delivery'); ?></span>
                            <span class="schedulify-step-separator">›</span>
                            <span class="schedulify-step-dot" data-step="2">2. <?php _e('Configure Rules', 'schedulify-delivery'); ?></span>
                        </div>
                    </div>
                    <button type="button" class="schedulify-modal-close" title="<?php esc_attr_e('Close', 'schedulify-delivery'); ?>">&times;</button>
                </div>

                <form method="post" action="" id="schedulify-zone-rule-form">
                    <?php wp_nonce_field('schedulify_zone_rule_nonce_action', 'schedulify_zone_rule_nonce'); ?>
                    <input type="hidden" name="schedulify_save_zone_rule" value="1">
                    <input type="hidden" name="rule_id" id="schedulify_rule_id" value="">

                    <div class="schedulify-modal-body">

                        <!-- STEP 1: SELECT ZONES -->
                        <div class="schedulify-modal-step active" id="schedulify-modal-step-1">
                            <div class="schedulify-district-toolbar">
                                <div class="schedulify-search-box">
                                    <span class="dashicons dashicons-search"></span>
                                    <input type="text" id="schedulify-district-search" placeholder="<?php esc_attr_e('Search zone (e.g. Bogura, Dhaka)...', 'schedulify-delivery'); ?>">
                                </div>
                                <div class="schedulify-quick-select-buttons">
                                    <button type="button" class="button button-small" id="schedulify-select-all-districts"><?php _e('Select All', 'schedulify-delivery'); ?></button>
                                    <button type="button" class="button button-small" id="schedulify-deselect-all-districts"><?php _e('Deselect All', 'schedulify-delivery'); ?></button>
                                </div>
                            </div>

                            <div class="schedulify-district-selection-grid" id="schedulify-district-grid">
                                <?php foreach ($all_districts as $dcode => $dname) : ?>
                                    <label class="schedulify-district-card" data-district-name="<?php echo esc_attr(strtolower($dname . ' ' . $dcode)); ?>">
                                        <input type="checkbox" name="districts[]" value="<?php echo esc_attr($dcode); ?>" class="schedulify-district-checkbox">
                                        <div class="schedulify-district-info">
                                            <strong><?php echo esc_html($dname); ?></strong>
                                            <span class="schedulify-district-code"><?php echo esc_html($dcode); ?></span>
                                        </div>
                                    </label>
                                <?php endforeach; ?>

                                <div class="schedulify-no-zones-available" id="schedulify-no-zones-notice" style="display:none;">
                                    <span class="dashicons dashicons-warning"></span>
                                    <h4><?php _e('No Zones Available', 'schedulify-delivery'); ?></h4>
                                    <p><?php _e('All delivery zones have already been assigned. Edit an existing rule to update a zone.', 'schedulify-delivery'); ?></p>
                                </div>
                                <div class="schedulify-no-zones-available" id="schedulify-no-search-results" style="display:none;">
                                    <span class="dashicons dashicons-search"></span>
                                    <h4><?php _e('No Matching Zones Found', 'schedulify-delivery'); ?></h4>
                                    <p><?php _e('No available zones match your search query.', 'schedulify-delivery'); ?></p>
                                </div>
                            </div>
                        </div>

                        <!-- STEP 2: CONFIGURE RULES (tabbed per shipping method) -->
                        <div class="schedulify-modal-step" id="schedulify-modal-step-2" style="display:none;">

                            <div class="schedulify-selected-zones-pill-bar">
                                <div class="schedulify-pill-bar-left">
                                    <span class="schedulify-pill-label"><?php _e('Applying rules to:', 'schedulify-delivery'); ?></span>
                                    <div id="schedulify-selected-zones-pills" class="schedulify-pills-list"></div>
                                </div>
                                <button type="button" class="button button-secondary schedulify-btn-modify-zones" id="schedulify-btn-change-zones">
                                    <?php _e('Change Zones', 'schedulify-delivery'); ?>
                                </button>
                            </div>

                            <div class="schedulify-methods-wrapper">
                                <div class="schedulify-methods-header">
                                    <div class="schedulify-methods-header-title">
                                        <span class="dashicons dashicons-car"></span>
                                        <strong><?php _e('Configure Shipping Methods', 'schedulify-delivery'); ?></strong>
                                    </div>
                                    <p class="description">
                                        <?php _e('Set delivery delays, weekly off-days, and blackout dates per shipping method for this zone.', 'schedulify-delivery'); ?>
                                    </p>
                                </div>

                                <div class="schedulify-method-tabs-nav" id="schedulify-method-tabs-nav">
                                    <!-- populated by JS -->
                                </div>
                                <div class="schedulify-method-tabs-content" id="schedulify-method-tabs-content">
                                    <!-- populated by JS -->
                                </div>
                            </div>

                        </div>

                    </div><!-- /modal-body -->

                    <div class="schedulify-modal-footer">
                        <button type="button" class="button button-secondary schedulify-modal-close"><?php _e('Cancel', 'schedulify-delivery'); ?></button>
                        <button type="button" class="button button-primary" id="schedulify-modal-btn-next">
                            <?php _e('Next', 'schedulify-delivery'); ?> &rarr;
                        </button>
                        <button type="submit" class="button button-primary" id="schedulify-modal-btn-save" style="display:none;">
                            <?php _e('Save Rules', 'schedulify-delivery'); ?>
                        </button>
                    </div>

                </form>
            </div>
        </div>
        <?php
    }

}

// Backward compatibility alias
if (!class_exists('schedulify_Settings')) {
    class_alias('Schedulify_Settings', 'schedulify_Settings');
}
 