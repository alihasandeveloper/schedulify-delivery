<?php
/**
 * Fired when the plugin is uninstalled.
 *
 * @package Schedulify_Delivery
 */

// If uninstall not called from WordPress, exit.
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Check if user has opted to delete data on uninstall (optional clean-up)
$delete_data = apply_filters('schedulify_delivery_delete_data_on_uninstall', false);

if ($delete_data) {
    global $wpdb;

    // Delete options
    delete_option('schedulify_delivery_settings');
    delete_option('schedulify_settings');

    // Delete custom tables if configured
    $tables = [
        $wpdb->prefix . 'schedulify_zone_rules',
        $wpdb->prefix . 'schedulify_settings',
        $wpdb->prefix . 'schedulify_zone_rules',
        $wpdb->prefix . 'schedulify_settings',
    ];

    foreach ($tables as $table) {
        $wpdb->query("DROP TABLE IF EXISTS {$table}");
    }
}
