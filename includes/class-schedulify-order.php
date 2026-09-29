<?php
/**
 * Schedulify Delivery - Order Management & HPOS Compatibility
 */

if (!defined('ABSPATH')) {
    exit;
}

class Schedulify_Order {

    private static $instance = null;

    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Save order meta on checkout (Classic)
        add_action('woocommerce_checkout_create_order', [$this, 'save_checkout_order_meta'], 10, 2);
        
        // Save order meta on Store API checkout (Block Checkout)
        add_action('woocommerce_store_api_checkout_update_order_from_request', [$this, 'save_block_checkout_order_meta'], 10, 2);

        // Display in Admin Order Details
        add_action('woocommerce_admin_order_data_after_shipping_address', [$this, 'render_admin_order_delivery_details']);
        add_action('woocommerce_process_shop_order_meta', [$this, 'save_admin_order_delivery_details']);

        // Admin Orders List Column
        add_filter('manage_edit-shop_order_columns', [$this, 'add_order_list_column']);
        add_action('manage_shop_order_posts_custom_column', [$this, 'render_order_list_column_content'], 10, 2);
        
        // HPOS compatibility for column
        add_filter('woocommerce_shop_order_list_table_columns', [$this, 'add_order_list_column']);
        add_action('woocommerce_shop_order_list_table_custom_column', [$this, 'render_hpos_order_list_column_content'], 10, 2);

        // Display on Customer Thank You page & View Order page
        add_action('woocommerce_order_details_after_order_table', [$this, 'render_customer_order_delivery_details']);
    }

    public function save_checkout_order_meta($order, $data = null) {
        $delivery_data = $this->get_delivery_data_from_request_or_session();

        if (!empty($delivery_data['date'])) {
            $order->update_meta_data('_schedulify_delivery_date', $delivery_data['date']);
            if (!empty($delivery_data['notes'])) {
                $order->update_meta_data('_schedulify_delivery_notes', $delivery_data['notes']);
            }
        }

        // Always clear session after order creation to prevent ghost dates on future checkouts
        if (function_exists('WC') && WC()->session) {
            WC()->session->__unset('schedulify_delivery_data');
        }
    }

    public function save_block_checkout_order_meta($order, $request) {
        $this->save_checkout_order_meta($order);
    }

    private function get_delivery_data_from_request_or_session() {
        if (!empty($_POST['schedulify_delivery_date'])) {
            return [
                'date'  => sanitize_text_field($_POST['schedulify_delivery_date']),
                'notes' => sanitize_text_field($_POST['schedulify_delivery_notes'] ?? ''),
            ];
        }

        if (function_exists('WC') && WC()->session) {
            $session_data = WC()->session->get('schedulify_delivery_data');
            if (!empty($session_data) && is_array($session_data)) {
                return $session_data;
            }
        }

        return [];
    }

    public static function get_order_delivery_date($order) {
        if (!$order) {
            return '';
        }
        return $order->get_meta('_schedulify_delivery_date');
    }

    public static function get_order_delivery_notes($order) {
        if (!$order) {
            return '';
        }
        return $order->get_meta('_schedulify_delivery_notes');
    }

    public function render_admin_order_delivery_details($order) {
        $delivery_date = self::get_order_delivery_date($order);
        if (!$delivery_date) {
            return;
        }

        $delivery_notes = self::get_order_delivery_notes($order);
        ?>
        <div class="order_data_column" style="width: 100%; border-top: 1px solid #ddd; margin-top: 15px; padding-top: 10px;">
            <h3 style="display:flex; align-items:center; gap:6px; color:#2271b1; margin-bottom:10px;">
                <span class="dashicons dashicons-calendar-alt"></span>
                <?php _e('Delivery Details', 'schedulify-delivery'); ?>
            </h3>

            <p class="form-field form-field-wide">
                <label for="schedulify_admin_edit_delivery_date"><strong><?php _e('Delivery Date:', 'schedulify-delivery'); ?></strong></label>
                <input type="date" name="schedulify_admin_edit_delivery_date" id="schedulify_admin_edit_delivery_date" value="<?php echo esc_attr($delivery_date); ?>" style="width:100%; max-width:240px; font-weight:bold;">
                <span class="description" style="margin-left: 8px;">(<?php echo esc_html(date_i18n(get_option('date_format'), strtotime($delivery_date))); ?>)</span>
            </p>

            <?php if (!empty($delivery_notes)) : ?>
                <p class="form-field form-field-wide">
                    <strong><?php _e('Customer Instructions:', 'schedulify-delivery'); ?></strong><br>
                    <em style="color:#555; background:#fbf0df; padding:4px 8px; border-radius:4px; display:inline-block;"><?php echo esc_html($delivery_notes); ?></em>
                </p>
            <?php endif; ?>
        </div>
        <?php
    }

    public function save_admin_order_delivery_details($order_id) {
        $order = wc_get_order($order_id);
        if (!$order) {
            return;
        }

        if (isset($_POST['schedulify_admin_edit_delivery_date'])) {
            $new_date = sanitize_text_field($_POST['schedulify_admin_edit_delivery_date']);
            $order->update_meta_data('_schedulify_delivery_date', $new_date);
            $order->save();
        }
    }

    public function add_order_list_column($columns) {
        $new_columns = [];
        foreach ($columns as $key => $title) {
            $new_columns[$key] = $title;
            if ('order_status' === $key || 'order_date' === $key) {
                $new_columns['schedulify_delivery_schedule'] = __('Delivery Date', 'schedulify-delivery');
            }
        }
        if (!isset($new_columns['schedulify_delivery_schedule'])) {
            $new_columns['schedulify_delivery_schedule'] = __('Delivery Date', 'schedulify-delivery');
        }
        return $new_columns;
    }

    public function render_order_list_column_content($column, $post_id) {
        if ('schedulify_delivery_schedule' === $column) {
            $order = wc_get_order($post_id);
            if ($order) {
                $this->print_column_schedule($order);
            }
        }
    }

    public function render_hpos_order_list_column_content($column, $order) {
        if ('schedulify_delivery_schedule' === $column && $order) {
            $this->print_column_schedule($order);
        }
    }

    private function print_column_schedule($order) {
        $date = self::get_order_delivery_date($order);
        if (!$date) {
            echo '<span style="color:#aaa;">&mdash;</span>';
            return;
        }

        $formatted_date = date_i18n('d M, Y', strtotime($date));

        echo '<div>';
        echo '<strong style="color:#1e293b;">' . esc_html($formatted_date) . '</strong>';
        echo '</div>';
    }

    public function render_customer_order_delivery_details($order) {
        $date = self::get_order_delivery_date($order);
        if (!$date) {
            return;
        }

        $notes = self::get_order_delivery_notes($order);
        $formatted_date = date_i18n(get_option('date_format'), strtotime($date));
        ?>
        <section class="woocommerce-customer-details schedulify-customer-delivery-box">
            <p class="woocommerce-column__title">
                <?php _e('Delivery Schedule Details', 'schedulify-delivery'); ?>
            </p>
            <table class="woocommerce-table woocommerce-table--order-details shop_table order_details">
                <tbody>
                    <tr>
                        <th><?php _e('Delivery Date:', 'schedulify-delivery'); ?></th>
                        <td class="schedulify-order-date-value">
                            <?php echo esc_html($formatted_date); ?>
                        </td>
                    </tr>
                    <?php if (!empty($notes)) : ?>
                        <tr>
                            <th><?php _e('Special Instructions:', 'schedulify-delivery'); ?></th>
                            <td><em><?php echo esc_html($notes); ?></em></td>
                        </tr>
                    <?php endif; ?>
                </tbody>
            </table>
        </section>
        <?php
    }
}

// Backward compatibility alias
if (!class_exists('schedulify_Order')) {
    class_alias('Schedulify_Order', 'schedulify_Order');
}
