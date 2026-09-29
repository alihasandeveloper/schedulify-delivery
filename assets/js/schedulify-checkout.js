/**
 * Schedulify Delivery - Checkout Frontend Script
 * Supports both Classic Shortcode Checkout and WooCommerce Gutenberg Block Checkout
 */
(function ($) {
    'use strict';

    if (typeof schedulifyData === 'undefined') {
        return;
    }

    const { settings, active_district_code, active_rule, district_to_rule_map, zone_rules, matrices, serverTime, i18n, ajax_url, nonce, rest_url, rest_nonce } = schedulifyData;

    // Ensure wp.apiFetch has the correct REST API root URL so WooCommerce Blocks requests never hit /undefinedwc/store/v1/cart
    if (window.wp && window.wp.apiFetch && rest_url) {
        try {
            if (typeof window.wp.apiFetch.createRootURLMiddleware === 'function') {
                window.wp.apiFetch.use(window.wp.apiFetch.createRootURLMiddleware(rest_url));
            }
            if (typeof window.wp.apiFetch.createNonceMiddleware === 'function' && rest_nonce) {
                window.wp.apiFetch.use(window.wp.apiFetch.createNonceMiddleware(rest_nonce));
            }
        } catch (e) { }
    }

    let flatpickrInstance = null;
    let userSelectedDate = null;
    let schedulerTemplate = '';
    let currentActiveRule = active_rule || { delay_hours: 0, off_days: [], blackout_dates: '', allowed_dates: '', disabled_date_ranges: [] };
    let currentMatrixKey = (active_rule && active_rule.id) ? active_rule.id : 'general_default';

    /**
     * Helper: Format Date object to YYYY-MM-DD
     */
    function formatDateYMD(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Helper: Detect current district code from checkout form
     */
    function detectCurrentDistrictCode() {
        const $shipState = $('#shipping_state:visible');
        const $billState = $('#billing_state');
        let stateCode = '';

        if ($shipState.length && $shipState.val()) {
            stateCode = $shipState.val();
        } else if ($billState.length && $billState.val()) {
            stateCode = $billState.val();
        }

        // Block checkout store check
        if (!stateCode && window.wp && window.wp.data) {
            try {
                const cart = window.wp.data.select('wc/store/cart').getCartData();
                if (cart && cart.shippingAddress && cart.shippingAddress.state) {
                    stateCode = cart.shippingAddress.state;
                } else if (cart && cart.billingAddress && cart.billingAddress.state) {
                    stateCode = cart.billingAddress.state;
                }
            } catch (e) { }
        }

        return stateCode || active_district_code || '';
    }

    /**
     * Helper: Detect current shipping method from checkout
     */
    function detectCurrentShippingMethod() {
        let method = '';
        const $checkedMethod = $('input[name^="shipping_method"]:checked, input[name="shipping_method[0]"]');
        if ($checkedMethod.length) {
            method = $checkedMethod.val() || '';
        }

        // Block checkout store check
        if (!method && window.wp && window.wp.data) {
            try {
                const cart = window.wp.data.select('wc/store/cart').getCartData();
                if (cart && cart.shippingRates && cart.shippingRates.length) {
                    for (let rate of cart.shippingRates) {
                        if (rate.selected) {
                            method = rate.rate_id;
                            break;
                        }
                    }
                }
            } catch (e) { }
        }

        return method;
    }

    /**
     * Helper: Update active rule based on current selected district and shipping method
     */
    function updateActiveRuleFromDistrict() {
        const districtCode = detectCurrentDistrictCode();
        const shippingMethod = detectCurrentShippingMethod();

        if (!districtCode || !zone_rules || !zone_rules.length) {
            currentActiveRule = active_rule || { delay_hours: 0, off_days: [], blackout_dates: '', allowed_dates: '', disabled_date_ranges: [] };
            currentMatrixKey = 'general_default';
            return;
        }

        let foundRule = null;

        // 1. Priority: Match District + Specific Shipping Method
        if (shippingMethod) {
            for (let r of zone_rules) {
                const dList = r.districts || [];
                const rMethod = r.shipping_method_id || 'all';
                if (dList.includes(districtCode) && rMethod !== 'all' && (rMethod === shippingMethod || shippingMethod.startsWith(rMethod))) {
                    foundRule = r;
                    break;
                }
            }
        }

        // 2. Priority: Match District + All Shipping Methods
        if (!foundRule) {
            for (let r of zone_rules) {
                const dList = r.districts || [];
                const rMethod = r.shipping_method_id || 'all';
                if (dList.includes(districtCode) && rMethod === 'all') {
                    foundRule = r;
                    break;
                }
            }
        }

        // 3. Fallback: Any matching district rule
        if (!foundRule) {
            for (let r of zone_rules) {
                const dList = r.districts || [];
                if (dList.includes(districtCode)) {
                    foundRule = r;
                    break;
                }
            }
        }

        const generalOffDays = (settings && settings.off_days) || (active_rule && active_rule.off_days) || [];
        const generalBlackout = (settings && settings.blackout_dates) || (active_rule && active_rule.blackout_dates) || '';
        const generalAllowed = (settings && settings.allowed_dates) || (active_rule && active_rule.allowed_dates) || '';
        const generalRanges = (settings && settings.disabled_date_ranges) || (active_rule && active_rule.disabled_date_ranges) || [];

        if (foundRule) {
            currentActiveRule = {
                id: foundRule.id || '',
                shipping_method_id: foundRule.shipping_method_id || '',
                shipping_method_title: foundRule.shipping_method_title || '',
                delay_hours: foundRule.delay_hours !== undefined ? foundRule.delay_hours : 0,
                off_days: (foundRule.off_days && foundRule.off_days.length > 0) ? foundRule.off_days : generalOffDays,
                disabled_date_ranges: (foundRule.disabled_date_ranges && foundRule.disabled_date_ranges.length > 0) ? foundRule.disabled_date_ranges : generalRanges,
                blackout_dates: (foundRule.blackout_dates && String(foundRule.blackout_dates).trim() !== '') ? foundRule.blackout_dates : generalBlackout,
                allowed_dates: (foundRule.allowed_dates && String(foundRule.allowed_dates).trim() !== '') ? foundRule.allowed_dates : generalAllowed,
            };
            currentMatrixKey = foundRule.id || 'general_default';
        } else {
            currentActiveRule = {
                delay_hours: 0,
                off_days: generalOffDays,
                blackout_dates: generalBlackout,
                allowed_dates: generalAllowed,
                disabled_date_ranges: generalRanges
            };
            currentMatrixKey = 'general_default';
        }
    }

    /**
     * Helper: Calculate earliest allowed YYYY-MM-DD date based on delay hours
     */
    function getEarliestAllowedDate() {
        const delayHours = Math.max(0, parseInt(currentActiveRule.delay_hours || 0, 10));
        const baseTimestamp = (serverTime && serverTime.timestamp) ? (serverTime.timestamp * 1000) : Date.now();
        const earliestMs = baseTimestamp + (delayHours * 3600 * 1000);
        return formatDateYMD(new Date(earliestMs));
    }

    /**
     * Helper: Check if a specific date object is allowed for delivery
     */
    function isDateAllowed(dateObj) {
        const ymd = formatDateYMD(dateObj);
        const earliestAllowed = getEarliestAllowedDate();

        // Cannot deliver before earliest allowed date (delay hours)
        if (ymd < earliestAllowed) {
            return false;
        }

        // Cannot deliver in the past
        if (serverTime && serverTime.date && ymd < serverTime.date) {
            return false;
        }

        // Parse allowed dates
        let allowedList = [];
        if (currentActiveRule.allowed_dates) {
            if (Array.isArray(currentActiveRule.allowed_dates)) {
                allowedList = currentActiveRule.allowed_dates;
            } else {
                allowedList = currentActiveRule.allowed_dates.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
            }
        }

        // Allowed dates override / exception
        if (allowedList.includes(ymd)) {
            return true;
        }

        // Weekly off-days
        const offDays = (currentActiveRule.off_days || []).map(Number);
        if (offDays.includes(dateObj.getDay())) {
            return false;
        }

        // Blackout / Holiday dates
        let blackoutList = [];
        if (currentActiveRule.blackout_dates) {
            if (Array.isArray(currentActiveRule.blackout_dates)) {
                blackoutList = currentActiveRule.blackout_dates;
            } else {
                blackoutList = currentActiveRule.blackout_dates.split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
            }
        }
        if (blackoutList.includes(ymd)) {
            return false;
        }

        // Disabled date ranges
        if (currentActiveRule.disabled_date_ranges && currentActiveRule.disabled_date_ranges.length > 0) {
            for (let r of currentActiveRule.disabled_date_ranges) {
                if (r.start && r.end) {
                    if (ymd >= r.start && ymd <= r.end) {
                        return false;
                    }
                }
            }
        }

        // Matrix array check if pre-calculated
        if (matrices && matrices[currentMatrixKey] && matrices[currentMatrixKey].standard) {
            if (matrices[currentMatrixKey].standard[ymd] === false) {
                return false;
            }
        }

        return true;
    }

    /**
     * Sync chosen delivery state to WooCommerce Session via AJAX
     */
    function syncWithSession() {
        if (!ajax_url) return;
        const chosenDate = $('#schedulify_delivery_date').val() || userSelectedDate || '';
        $.post(ajax_url, {
            action: 'schedulify_update_session',
            nonce: nonce,
            date: chosenDate,
            notes: $('#schedulify_delivery_notes').val() || ''
        });
    }

    /**
     * Re-calculate & refresh Flatpickr with active district rules
     */
    function refreshCalendarRules(forceClear = false) {
        updateActiveRuleFromDistrict();

        if (!flatpickrInstance) return;

        const minDate = getEarliestAllowedDate();
        flatpickrInstance.set('minDate', minDate);

        if (forceClear) {
            userSelectedDate = null;
            $('#schedulify_delivery_date').val('');
            flatpickrInstance.clear();
            syncWithSession();
            return;
        }

        // Check if user has already selected a date
        const currentDateStr = $('#schedulify_delivery_date').val() || userSelectedDate;

        if (currentDateStr) {
            const parts = currentDateStr.split('-').map(Number);
            const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
            if (!isDateAllowed(dateObj)) {
                userSelectedDate = null;
                $('#schedulify_delivery_date').val('');
                flatpickrInstance.clear();
                syncWithSession();
            } else {
                flatpickrInstance.redraw();
            }
        } else {
            flatpickrInstance.redraw();
        }
    }

    /**
     * Initialize Flatpickr
     */
    function initFlatpickr() {
        const inputEl = document.getElementById('schedulify_delivery_date_display');
        if (!inputEl || typeof flatpickr === 'undefined') {
            return;
        }

        if (inputEl._flatpickr) {
            refreshCalendarRules();
            return;
        }

        updateActiveRuleFromDistrict();
        const minDate = getEarliestAllowedDate();

        let targetDate = null;
        if (userSelectedDate) {
            const parts = userSelectedDate.split('-').map(Number);
            const testObj = new Date(parts[0], parts[1] - 1, parts[2]);
            if (isDateAllowed(testObj)) {
                targetDate = userSelectedDate;
            }
        }

        const disabledRules = [
            function (date) {
                return !isDateAllowed(date);
            }
        ];

        const flatpickrConfig = {
            minDate: minDate,
            dateFormat: 'Y-m-d',
            altInput: true,
            altFormat: 'j F, Y',
            disableMobile: true,
            animate: false,
            monthSelectorType: 'static',
            disable: disabledRules,
            onChange: function (selectedDates, dateStr) {
                if (dateStr) {
                    userSelectedDate = dateStr;
                    $('#schedulify_delivery_date').val(dateStr);
                    syncWithSession();
                } else {
                    userSelectedDate = null;
                    $('#schedulify_delivery_date').val('');
                    syncWithSession();
                }
            }
        };

        if (targetDate) {
            flatpickrConfig.defaultDate = targetDate;
        }

        flatpickrInstance = flatpickr(inputEl, flatpickrConfig);

        if (targetDate) {
            $('#schedulify_delivery_date').val(targetDate);
            syncWithSession();
        }
    }

    /**
     * Mount into WooCommerce Block Checkout directly below Shipping options & above Payment
     */
    function mountToBlockCheckout() {
        if (!schedulerTemplate) {
            const $existing = $('#schedulify-delivery-scheduler-wrapper');
            if ($existing.length) {
                schedulerTemplate = $existing[0].outerHTML;
            }
        }

        let $wrapper = $('#schedulify-delivery-scheduler-wrapper');
        if (!$wrapper.length && schedulerTemplate) {
            $wrapper = $(schedulerTemplate);
        }

        if (!$wrapper || !$wrapper.length) {
            return false;
        }

        let $target = null;
        let method = 'insertAfter';

        const shippingSelectors = [
            '[data-block-name="woocommerce/checkout-shipping-methods-block"]',
            '.wp-block-woocommerce-checkout-shipping-methods-block',
            '.wc-block-checkout__shipping-methods',
            'fieldset.wc-block-checkout__shipping-options',
            '.wc-block-components-shipping-rates-control',
            '[data-block-name="woocommerce/checkout-shipping-method-block"]',
            '.woocommerce-shipping-totals',
            '#shipping_method',
            '.woocommerce-shipping-methods'
        ];

        for (let sel of shippingSelectors) {
            const $found = $(sel);
            if ($found.length) {
                const $panel = $found.closest('.wc-block-components-panel, .wp-block-woocommerce-checkout-shipping-methods-block, fieldset, tr');
                $target = $panel.length ? $panel : $found.first();
                method = 'insertAfter';
                break;
            }
        }

        if (!$target || !$target.length) {
            const paymentSelectors = [
                '[data-block-name="woocommerce/checkout-payment-block"]',
                '.wp-block-woocommerce-checkout-payment-block',
                '.wc-block-checkout__payment-methods',
                'fieldset.wc-block-checkout__payment-options',
                '.wc-block-components-checkout-step--payment',
                '[data-block-name="woocommerce/checkout-payment-methods-block"]',
                '#payment',
                '.woocommerce-checkout-payment'
            ];

            for (let sel of paymentSelectors) {
                const $found = $(sel);
                if ($found.length) {
                    const $panel = $found.closest('.wc-block-components-panel, .wp-block-woocommerce-checkout-payment-block, fieldset, form') || $found.first();
                    $target = $panel.length ? $panel : $found.first();
                    method = 'insertBefore';
                    break;
                }
            }
        }

        if (!$target || !$target.length) {
            const fallbackSelectors = [
                '[data-block-name="woocommerce/checkout-additional-information-block"]',
                '[data-block-name="woocommerce/checkout-order-note-block"]',
                '.wc-block-checkout__actions',
                '[data-block-name="woocommerce/checkout-actions-block"]',
                '#place_order',
                '.wc-block-checkout__main'
            ];

            for (let sel of fallbackSelectors) {
                const $found = $(sel);
                if ($found.length) {
                    $target = $found.first();
                    method = sel === '.wc-block-checkout__main' ? 'append' : 'insertBefore';
                    break;
                }
            }
        }

        let needsMove = true;
        if ($target && $target.length) {
            const isAlreadyCorrect = (method === 'insertAfter' && $target.next().is('#schedulify-delivery-scheduler-wrapper')) ||
                (method === 'insertBefore' && $target.prev().is('#schedulify-delivery-scheduler-wrapper'));

            if (isAlreadyCorrect) {
                needsMove = false;
            } else {
                $wrapper.detach();
                if (method === 'insertAfter') {
                    $wrapper.insertAfter($target);
                } else if (method === 'insertBefore') {
                    $wrapper.insertBefore($target);
                } else if (method === 'append') {
                    $target.append($wrapper);
                }
            }

            $('#schedulify-block-fallback-container').hide();
        }

        $wrapper.css('display', 'block').show();
        initFlatpickr();
        return !needsMove;
    }

    /**
     * Initialization & Event Binding
     */
    $(document).ready(function () {
        if ($('body').hasClass('woocommerce-order-received') || $('.woocommerce-order-received').length || $('[data-block-name="woocommerce/order-confirmation-status-block"]').length) {
            return;
        }

        const $initWrapper = $('#schedulify-delivery-scheduler-wrapper');
        if ($initWrapper.length) {
            schedulerTemplate = $initWrapper[0].outerHTML;
        }

        mountToBlockCheckout();

        let count = 0;
        const mountInterval = setInterval(function () {
            const success = mountToBlockCheckout();
            count++;
            if (count >= 20 || (success && count >= 5)) {
                clearInterval(mountInterval);
            }
        }, 300);

        // Listen for district / state / city changes on checkout
        $(document).on('change', '#billing_state, #shipping_state, #billing_city, #shipping_city', function () {
            refreshCalendarRules();
        });

        // Listen for shipping method changes on checkout
        $(document).on('change', 'input[name^="shipping_method"], .wc_payment_methods input[type="radio"]', function () {
            refreshCalendarRules();
        });

        // Observe dynamic DOM changes for block checkout, ignore flatpickr calendar mutations
        let debounceTimer = null;
        const observer = new MutationObserver(function (mutations) {
            let onlyFlatpickr = true;
            for (let m of mutations) {
                if (m.target && (
                    $(m.target).closest('.flatpickr-calendar, .schedulify-scheduler-card').length ||
                    $(m.target).hasClass('flatpickr-calendar')
                )) {
                    continue;
                }
                onlyFlatpickr = false;
                break;
            }

            if (onlyFlatpickr) {
                return;
            }

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(function () {
                const $w = $('#schedulify-delivery-scheduler-wrapper');
                if ($w.length && document.body.contains($w[0]) && $w.is(':visible')) {
                    const $shipping = $('[data-block-name="woocommerce/checkout-shipping-methods-block"], .wp-block-woocommerce-checkout-shipping-methods-block, .wc-block-checkout__shipping-methods');
                    if ($shipping.length && $shipping.next().is('#schedulify-delivery-scheduler-wrapper')) {
                        refreshCalendarRules();
                        return;
                    }
                }
                mountToBlockCheckout();
            }, 150);
        });

        const targetNode = document.querySelector('.wp-block-woocommerce-checkout, .wc-block-checkout, form.checkout, body');
        if (targetNode) {
            observer.observe(targetNode, { childList: true, subtree: true });
        }

        // Re-init and update rules on WooCommerce checkout updates
        $(document.body).on('updated_checkout updated_shipping_method', function () {
            mountToBlockCheckout();
            refreshCalendarRules();
        });
    });

})(jQuery);
