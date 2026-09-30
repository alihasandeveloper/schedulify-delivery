<?php
/**
 * Schedulify Delivery - Custom Database Management
 */

if (!defined('ABSPATH')) {
    exit;
}

class Schedulify_DB {

    private static $cached_general_settings = null;
    private static $cached_zone_rules = null;
    private static $cached_all_settings = null;

    public static function flush_cache() {
        self::$cached_general_settings = null;
        self::$cached_zone_rules = null;
        self::$cached_all_settings = null;
    }

    public static function get_settings_table() {
        global $wpdb;
        return $wpdb->prefix . 'schedulify_settings';
    }

    public static function get_zone_rules_table() {
        global $wpdb;
        return $wpdb->prefix . 'schedulify_zone_rules';
    }

    /**
     * Create / Update Custom Tables
     */
    public static function create_tables() {
        global $wpdb;
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';

        $charset_collate = $wpdb->get_charset_collate();
        $settings_table = self::get_settings_table();
        $zone_rules_table = self::get_zone_rules_table();

        // 1. General Settings Table
        $sql_settings = "CREATE TABLE {$settings_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            setting_key varchar(191) NOT NULL,
            setting_value longtext DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY setting_key (setting_key)
        ) {$charset_collate};";

        // 2. Zone Delivery Rules Table
        $sql_zone_rules = "CREATE TABLE {$zone_rules_table} (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            rule_uid varchar(64) NOT NULL,
            shipping_method_id varchar(100) NOT NULL DEFAULT 'all',
            shipping_method_title varchar(255) NOT NULL DEFAULT '',
            districts text NOT NULL,
            delay_hours int(11) NOT NULL DEFAULT 12,
            off_days text DEFAULT NULL,
            disabled_date_ranges longtext DEFAULT NULL,
            blackout_dates text DEFAULT NULL,
            allowed_dates text DEFAULT NULL,
            methods longtext DEFAULT NULL,
            created_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY  (id),
            UNIQUE KEY rule_uid (rule_uid),
            KEY shipping_method_id (shipping_method_id)
        ) {$charset_collate};";

        dbDelta($sql_settings);
        dbDelta($sql_zone_rules);

        // Ensure methods column exists on existing installations
        $has_methods_col = $wpdb->get_results("SHOW COLUMNS FROM `{$zone_rules_table}` LIKE 'methods'");
        if (empty($has_methods_col)) {
            $wpdb->query("ALTER TABLE `{$zone_rules_table}` ADD COLUMN `methods` longtext DEFAULT NULL AFTER `allowed_dates`");
        }

        // Auto-migrate legacy data from wp_options or older schedulify tables if exists
        self::maybe_migrate_legacy_data();
        self::flush_cache();
    }

    /**
     * Migrate legacy data from older schedulify tables or wp_options if newly created tables are empty
     */
    private static function maybe_migrate_legacy_data() {
        global $wpdb;
        $settings_table = self::get_settings_table();
        $zone_rules_table = self::get_zone_rules_table();

        // Check if older schedulify_zone_rules table exists
        $old_rules_table = $wpdb->prefix . 'schedulify_zone_rules';
        $rules_count = $wpdb->get_var("SELECT COUNT(*) FROM {$zone_rules_table}");
        if (intval($rules_count) === 0 && $wpdb->get_var("SHOW TABLES LIKE '{$old_rules_table}'") === $old_rules_table) {
            $old_rules = $wpdb->get_results("SELECT * FROM {$old_rules_table}", ARRAY_A);
            if (!empty($old_rules)) {
                foreach ($old_rules as $orow) {
                    $wpdb->replace(
                        $zone_rules_table,
                        [
                            'rule_uid'              => $orow['rule_uid'] ?? 'rule_' . uniqid(),
                            'shipping_method_id'    => $orow['shipping_method_id'] ?? 'all',
                            'shipping_method_title' => $orow['shipping_method_title'] ?? '',
                            'districts'             => $orow['districts'] ?? '',
                            'delay_hours'           => intval($orow['delay_hours'] ?? 0),
                            'off_days'              => $orow['off_days'] ?? '',
                            'disabled_date_ranges'  => $orow['disabled_date_ranges'] ?? '',
                            'blackout_dates'        => $orow['blackout_dates'] ?? '',
                            'allowed_dates'         => $orow['allowed_dates'] ?? '',
                            'created_at'            => $orow['created_at'] ?? current_time('mysql'),
                            'updated_at'            => current_time('mysql'),
                        ]
                    );
                }
            }
        }

        // Check if older schedulify_settings table exists
        $old_settings_table = $wpdb->prefix . 'schedulify_settings';
        $settings_count = $wpdb->get_var("SELECT COUNT(*) FROM {$settings_table}");
        if (intval($settings_count) === 0 && $wpdb->get_var("SHOW TABLES LIKE '{$old_settings_table}'") === $old_settings_table) {
            $old_settings = $wpdb->get_results("SELECT * FROM {$old_settings_table}", ARRAY_A);
            if (!empty($old_settings)) {
                foreach ($old_settings as $srow) {
                    $wpdb->replace(
                        $settings_table,
                        [
                            'setting_key'   => $srow['setting_key'],
                            'setting_value' => $srow['setting_value'],
                            'updated_at'    => current_time('mysql'),
                        ]
                    );
                }
            }
        }

        // Check legacy options
        $legacy = get_option('schedulify_delivery_settings', null);
        if (empty($legacy)) {
            $legacy = get_option('schedulify_settings', null);
        }

        $count = $wpdb->get_var("SELECT COUNT(*) FROM {$settings_table}");
        if (intval($count) === 0) {
            if (empty($legacy) || !is_array($legacy)) {
                // Seed defaults if empty
                self::save_general_settings([
                    'enabled'              => 'yes',
                    'field_required'       => 'yes',
                    'field_position'       => 'woocommerce_after_order_notes',
                    'delay_hours'          => 0,
                    'max_advance_days'     => 56,
                    'off_days'             => [0],
                    'blackout_dates'       => '',
                    'disabled_date_ranges' => [],
                    'allowed_dates'        => '',
                ]);
            } else {
                self::save_general_settings([
                    'enabled'              => $legacy['enabled'] ?? 'yes',
                    'field_required'       => $legacy['field_required'] ?? 'yes',
                    'field_position'       => $legacy['field_position'] ?? 'woocommerce_after_order_notes',
                    'delay_hours'          => $legacy['delay_hours'] ?? 0,
                    'max_advance_days'     => $legacy['max_advance_days'] ?? 56,
                    'off_days'             => $legacy['off_days'] ?? [0],
                    'blackout_dates'       => $legacy['blackout_dates'] ?? '',
                    'disabled_date_ranges' => $legacy['disabled_date_ranges'] ?? [],
                    'allowed_dates'        => $legacy['allowed_dates'] ?? '',
                ]);
            }
        }
    }

    /**
     * Get General Settings
     */
    public static function get_general_settings() {
        if (null !== self::$cached_general_settings) {
            return self::$cached_general_settings;
        }

        global $wpdb;
        $table = self::get_settings_table();

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
        ];

        // Ensure table exists
        $results = $wpdb->get_results("SELECT setting_key, setting_value FROM {$table}", OBJECT_K);
        if (empty($results)) {
            self::$cached_general_settings = $defaults;
            return $defaults;
        }

        $settings = [];
        foreach ($defaults as $key => $default_val) {
            if (isset($results[$key])) {
                $val = maybe_unserialize($results[$key]->setting_value);
                $settings[$key] = $val;
            } else {
                $settings[$key] = $default_val;
            }
        }

        $merged = wp_parse_args($settings, $defaults);
        self::$cached_general_settings = $merged;
        return $merged;
    }

    /**
     * Save General Settings
     */
    public static function save_general_settings($data) {
        global $wpdb;
        $table = self::get_settings_table();

        foreach ($data as $key => $value) {
            $serialized = maybe_serialize($value);
            $wpdb->replace(
                $table,
                [
                    'setting_key'   => sanitize_key($key),
                    'setting_value' => $serialized,
                    'updated_at'    => current_time('mysql'),
                ],
                ['%s', '%s', '%s']
            );
        }

        self::flush_cache();
        if (class_exists('Schedulify_Settings')) {
            Schedulify_Settings::flush_cache();
        }

        // Also keep updated option for convenience
        update_option('schedulify_delivery_settings', self::get_all_settings());

        return true;
    }

    /**
     * Get all Zone Delivery Rules
     */
    public static function get_zone_rules() {
        if (null !== self::$cached_zone_rules) {
            return self::$cached_zone_rules;
        }

        global $wpdb;
        $table = self::get_zone_rules_table();

        $rows = $wpdb->get_results("SELECT * FROM {$table} ORDER BY id ASC", ARRAY_A);
        if (empty($rows)) {
            self::$cached_zone_rules = [];
            return [];
        }

        $rules = [];
        foreach ($rows as $row) {
            $methods_unserialized = !empty($row['methods']) ? (array) maybe_unserialize($row['methods']) : [];
            $m_id = !empty($row['shipping_method_id']) ? $row['shipping_method_id'] : 'all';
            $m_title = $row['shipping_method_title'] ?? '';

            // If methods array is empty, construct a fallback single-method entry from top columns
            if (empty($methods_unserialized)) {
                $methods_unserialized[$m_id] = [
                    'shipping_method_id'    => $m_id,
                    'shipping_method_title' => $m_title,
                    'delay_hours'           => intval($row['delay_hours']),
                    'off_days'              => (array) maybe_unserialize($row['off_days']),
                    'disabled_date_ranges'  => (array) maybe_unserialize($row['disabled_date_ranges']),
                    'blackout_dates'        => (string) ($row['blackout_dates'] ?? ''),
                    'allowed_dates'         => (string) ($row['allowed_dates'] ?? ''),
                ];
            }

            $rules[] = [
                'id'                    => $row['rule_uid'],
                'shipping_method_id'    => $m_id,
                'shipping_method_title' => $m_title,
                'districts'             => (array) maybe_unserialize($row['districts']),
                'delay_hours'           => intval($row['delay_hours']),
                'off_days'              => (array) maybe_unserialize($row['off_days']),
                'disabled_date_ranges'  => (array) maybe_unserialize($row['disabled_date_ranges']),
                'blackout_dates'        => (string) ($row['blackout_dates'] ?? ''),
                'allowed_dates'         => (string) ($row['allowed_dates'] ?? ''),
                'methods'               => $methods_unserialized,
            ];
        }

        self::$cached_zone_rules = $rules;
        return $rules;
    }

    /**
     * Save / Update a single Zone Delivery Rule
     */
    public static function save_zone_rule($rule) {
        global $wpdb;
        $table = self::get_zone_rules_table();

        $rule_uid = !empty($rule['id']) ? sanitize_text_field($rule['id']) : 'rule_' . uniqid();
        $districts = isset($rule['districts']) ? maybe_serialize((array)$rule['districts']) : maybe_serialize([]);
        
        $methods = !empty($rule['methods']) && is_array($rule['methods']) ? $rule['methods'] : [];
        $methods_serialized = !empty($methods) ? maybe_serialize($methods) : null;

        // Determine top-level summary columns
        $shipping_method_id = !empty($rule['shipping_method_id']) ? sanitize_text_field($rule['shipping_method_id']) : 'all';
        $shipping_method_title = !empty($rule['shipping_method_title']) ? sanitize_text_field($rule['shipping_method_title']) : '';
        $delay_hours = isset($rule['delay_hours']) ? max(0, intval($rule['delay_hours'])) : 0;
        $off_days = isset($rule['off_days']) ? maybe_serialize((array)$rule['off_days']) : maybe_serialize([]);
        $disabled_date_ranges = isset($rule['disabled_date_ranges']) ? maybe_serialize((array)$rule['disabled_date_ranges']) : maybe_serialize([]);
        $blackout_dates = sanitize_textarea_field($rule['blackout_dates'] ?? '');
        $allowed_dates = sanitize_textarea_field($rule['allowed_dates'] ?? '');

        // If multiple methods exist, grab first method as primary summary if top level is default
        if (!empty($methods)) {
            $first_m = reset($methods);
            if (empty($shipping_method_title) && !empty($first_m['shipping_method_title'])) {
                $shipping_method_title = $first_m['shipping_method_title'];
            }
            if (!isset($rule['delay_hours']) && isset($first_m['delay_hours'])) {
                $delay_hours = max(0, intval($first_m['delay_hours']));
            }
        }

        // Check if rule already exists by rule_uid
        $existing_id = $wpdb->get_var($wpdb->prepare("SELECT id FROM {$table} WHERE rule_uid = %s", $rule_uid));

        $data = [
            'rule_uid'              => $rule_uid,
            'shipping_method_id'    => $shipping_method_id,
            'shipping_method_title' => $shipping_method_title,
            'districts'             => $districts,
            'delay_hours'           => $delay_hours,
            'off_days'              => $off_days,
            'disabled_date_ranges'  => $disabled_date_ranges,
            'blackout_dates'        => $blackout_dates,
            'allowed_dates'         => $allowed_dates,
            'methods'               => $methods_serialized,
            'updated_at'            => current_time('mysql'),
        ];

        $format = ['%s', '%s', '%s', '%s', '%d', '%s', '%s', '%s', '%s', '%s', '%s'];

        if ($existing_id) {
            $wpdb->update($table, $data, ['id' => $existing_id], $format, ['%d']);
        } else {
            $data['created_at'] = current_time('mysql');
            $format[] = '%s';
            $wpdb->insert($table, $data, $format);
        }

        self::flush_cache();
        if (class_exists('Schedulify_Settings')) {
            Schedulify_Settings::flush_cache();
        }

        update_option('schedulify_delivery_settings', self::get_all_settings());
        return $rule_uid;
    }

    /**
     * Delete a single Zone Delivery Rule by rule_uid
     */
    public static function delete_zone_rule($rule_uid) {
        global $wpdb;
        $table = self::get_zone_rules_table();

        $deleted = $wpdb->delete(
            $table,
            ['rule_uid' => sanitize_text_field($rule_uid)],
            ['%s']
        );

        self::flush_cache();
        if (class_exists('Schedulify_Settings')) {
            Schedulify_Settings::flush_cache();
        }

        update_option('schedulify_delivery_settings', self::get_all_settings());
        return false !== $deleted;
    }

    /**
     * Get combined settings array for backward compatibility
     */
    public static function get_all_settings() {
        if (null !== self::$cached_all_settings) {
            return self::$cached_all_settings;
        }

        $general = self::get_general_settings();
        $zone_rules = self::get_zone_rules();
        $general['zone_rules'] = $zone_rules;
        self::$cached_all_settings = $general;
        return $general;
    }
}

// Backward compatibility alias
if (!class_exists('schedulify_DB')) {
    class_alias('Schedulify_DB', 'schedulify_DB');
}
