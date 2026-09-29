<?php
if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

/**
 * Schedulify Delivery Matrix Calculator
 * Dynamically calculates available delivery dates based on zone rules, delivery delay (hours), off-days, and holidays.
 */
class Schedulify_Matrix_Calculator {

    public $delay_hours = 0;
    public $max_days = 56;
    public $off_days = [];
    public $holidays = [];
    public $disabled_ranges = [];
    public $allowed_dates = [];
    public $timezone;

    public function __construct( $settings = [] ) {
        // Delivery Delay in Hours (e.g. 0, 12, 24, 48)
        if ( isset( $settings['delay_hours'] ) ) {
            $this->delay_hours = max( 0, intval( $settings['delay_hours'] ) );
        }

        // Max Advance Days
        if ( ! empty( $settings['max_advance_days'] ) ) {
            $this->max_days = intval( $settings['max_advance_days'] );
        }

        // Weekly Off-days (0=Sun, 1=Mon, ..., 6=Sat)
        if ( isset( $settings['off_days'] ) && is_array( $settings['off_days'] ) ) {
            $this->off_days = array_map( 'intval', $settings['off_days'] );
        }

        // Blackout / Holiday Dates
        if ( ! empty( $settings['blackout_dates'] ) ) {
            if ( is_array( $settings['blackout_dates'] ) ) {
                $this->holidays = array_filter( array_map( 'trim', $settings['blackout_dates'] ) );
            } else {
                $this->holidays = array_filter( array_map( 'trim', preg_split( '/[\r\n,]+/', $settings['blackout_dates'] ) ) );
            }
        }

        // Disabled Date Ranges
        if ( ! empty( $settings['disabled_date_ranges'] ) && is_array( $settings['disabled_date_ranges'] ) ) {
            foreach ( $settings['disabled_date_ranges'] as $range ) {
                if ( ! empty( $range['start'] ) && ! empty( $range['end'] ) ) {
                    try {
                        $start = new DateTime( $range['start'] );
                        $end   = new DateTime( $range['end'] );
                        $end->modify( '+1 day' );
                        $interval = new DateInterval( 'P1D' );
                        $period   = new DatePeriod( $start, $interval, $end );
                        foreach ( $period as $dt ) {
                            $this->disabled_ranges[] = $dt->format( 'Y-m-d' );
                        }
                    } catch ( Exception $e ) {
                    }
                }
            }
            $this->disabled_ranges = array_unique( $this->disabled_ranges );
        }

        // Allowed Dates Overrides
        if ( ! empty( $settings['allowed_dates'] ) ) {
            if ( is_array( $settings['allowed_dates'] ) ) {
                $this->allowed_dates = array_filter( array_map( 'trim', $settings['allowed_dates'] ) );
            } else {
                $this->allowed_dates = array_filter( array_map( 'trim', preg_split( '/[\r\n,]+/', $settings['allowed_dates'] ) ) );
            }
        }

        // Timezone (use WP timezone or fallback to Asia/Dhaka)
        if ( function_exists( 'wp_timezone' ) ) {
            $this->timezone = wp_timezone();
        } else {
            $this->timezone = new DateTimeZone( 'Asia/Dhaka' );
        }
    }

    /**
     * Generate the Delivery Availability Matrix for the store or zone
     *
     * @return array
     */
    public function get_delivery_availability_matrix() {
        $current_timestamp = function_exists('current_time') ? current_time('timestamp') : time();
        $today_ymd = function_exists('wp_date') ? wp_date('Y-m-d', $current_timestamp) : date('Y-m-d', $current_timestamp);

        // Calculate earliest possible delivery date based on current timestamp + delay hours
        $earliest_allowed_timestamp = $current_timestamp + ( $this->delay_hours * 3600 );
        $earliest_allowed_ymd = function_exists('wp_date') ? wp_date('Y-m-d', $earliest_allowed_timestamp) : date('Y-m-d', $earliest_allowed_timestamp);

        $standard_matrix = [];

        for ( $i = 0; $i <= $this->max_days; $i++ ) {
            $ymd = date('Y-m-d', strtotime("{$today_ymd} +{$i} day"));
            $day_of_week = intval(date('w', strtotime($ymd)));

            // If this date is before the earliest allowed delivery date (due to delay hours), it's not available
            if ( $ymd < $earliest_allowed_ymd ) {
                $standard_matrix[ $ymd ] = false;
                continue;
            }

            // Allowed dates override any off-day or holiday restriction
            if ( in_array( $ymd, $this->allowed_dates, true ) ) {
                $standard_matrix[ $ymd ] = true;
                continue;
            }

            // Check weekly off-days
            if ( in_array( $day_of_week, $this->off_days, true ) ) {
                $standard_matrix[ $ymd ] = false;
                continue;
            }

            // Check blackout dates
            if ( in_array( $ymd, $this->holidays, true ) ) {
                $standard_matrix[ $ymd ] = false;
                continue;
            }

            // Check disabled date ranges
            if ( in_array( $ymd, $this->disabled_ranges, true ) ) {
                $standard_matrix[ $ymd ] = false;
                continue;
            }

            $standard_matrix[ $ymd ] = true;
        }

        return [
            'standard'             => $standard_matrix,
            'allowed_dates'        => $this->allowed_dates,
            'earliest_allowed_ymd' => $earliest_allowed_ymd,
            'delay_hours'          => $this->delay_hours,
        ];
    }
}

// Backwards compatibility alias if needed
if ( ! class_exists( 'DeliveryMatrixCalculator' ) ) {
    class_alias( 'Schedulify_Matrix_Calculator', 'DeliveryMatrixCalculator' );
}
