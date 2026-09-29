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
    const initialGeneralDelay = (settings && settings.delay_hours !== undefined) ? parseInt(settings.delay_hours, 10) : ((active_rule && active_rule.delay_hours !== undefined) ? parseInt(active_rule.delay_hours, 10) : 0);
    let currentActiveRule = active_rule || { delay_hours: initialGeneralDelay, off_days: (settings && settings.off_days) || [], blackout_dates: (settings && settings.blackout_dates) || '', allowed_dates: (settings && settings.allowed_dates) || '', disabled_date_ranges: (settings && settings.disabled_date_ranges) || [] };
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
     * Helper: Normalize District Code from code or name (e.g. "Barishal" -> "BD-06")
     */
    function normalizeDistrictCode(raw) {
        if (!raw) return '';
        const clean = String(raw).trim();
        if (!clean) return '';

        // Standard BD-XX format
        if (/^BD-\d{2}$/i.test(clean)) {
            return clean.toUpperCase();
        }

        // Numeric string (e.g. "6" -> "BD-06")
        if (/^\d{1,2}$/.test(clean)) {
            return 'BD-' + clean.padStart(2, '0');
        }

        // Lookup in all_districts dictionary
        const districts = (typeof schedulifyData !== 'undefined' && schedulifyData.all_districts) ? schedulifyData.all_districts : {};
        const lowerClean = clean.toLowerCase();

        for (let code in districts) {
            if (code.toLowerCase() === lowerClean) {
                return code;
            }
            const name = String(districts[code]);
            const plainName = name.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
            if (plainName === lowerClean || name.toLowerCase() === lowerClean || lowerClean.includes(plainName) || plainName.includes(lowerClean)) {
                return code;
            }
        }

        return clean;
    }

    /**
     * Helper: Detect current district code from checkout form
     */
    function detectCurrentDistrictCode() {
        let raw = '';

        // 1. Classic Checkout inputs / selects
        const $shipState = $('#shipping_state:visible, #shipping_state');
        const $billState = $('#billing_state:visible, #billing_state');
        const $shipCity  = $('#shipping_city:visible, #shipping_city');
        const $billCity  = $('#billing_city:visible, #billing_city');

        if ($shipState.length && $shipState.val()) {
            raw = $shipState.val();
        } else if ($billState.length && $billState.val()) {
            raw = $billState.val();
        } else if ($shipCity.length && $shipCity.val()) {
            raw = $shipCity.val();
        } else if ($billCity.length && $billCity.val()) {
            raw = $billCity.val();
        }

        // 2. Block Checkout DOM inputs & comboboxes
        if (!raw) {
            const $blockElements = $('select[id*="state"], select[id*="district"], select[name*="state"], select[name*="district"], input[id*="state"], input[id*="district"], .wc-block-components-state-input select, .wc-block-components-state-input input, .wc-block-components-combobox input, .wc-block-components-combobox__input');
            if ($blockElements.length) {
                for (let i = 0; i < $blockElements.length; i++) {
                    const val = $($blockElements[i]).val();
                    if (val && String(val).trim()) {
                        raw = String(val).trim();
                        break;
                    }
                }
            }
        }

        // 3. Block checkout store check (wp.data wc/store/cart)
        if (!raw && window.wp && window.wp.data) {
            try {
                const cartStore = window.wp.data.select('wc/store/cart');
                if (cartStore) {
                    const cart = typeof cartStore.getCartData === 'function' ? cartStore.getCartData() : null;
                    const customer = typeof cartStore.getCustomerData === 'function' ? cartStore.getCustomerData() : null;

                    raw = (customer && customer.shippingAddress && customer.shippingAddress.state) ||
                          (customer && customer.billingAddress && customer.billingAddress.state) ||
                          (cart && cart.shippingAddress && cart.shippingAddress.state) ||
                          (cart && cart.billingAddress && cart.billingAddress.state) ||
                          (customer && customer.shippingAddress && customer.shippingAddress.city) ||
                          (cart && cart.shippingAddress && cart.shippingAddress.city) || '';
                }
            } catch (e) { }
        }

        if (!raw) {
            raw = active_district_code || '';
        }

        return normalizeDistrictCode(raw);
    }

    /**
     * Helper: Detect current shipping method details (ID + Title) from checkout
     */
    function detectCurrentShippingInfo() {
        let shipId = '';
        let shipTitle = '';
        let raw = '';

        // 1. Classic Checkout radio/select check
        const $classicChecked = $('input[name^="shipping_method"]:checked, input[name="shipping_method[0]"]:checked, select[name^="shipping_method"]');
        if ($classicChecked.length && $classicChecked.val()) {
            shipId = String($classicChecked.val()).trim();
            const $lbl = $classicChecked.closest('li, label, tr');
            if ($lbl.length) {
                shipTitle = $lbl.text().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
            }
            return { id: shipId, title: shipTitle, raw: shipId + ' ' + shipTitle };
        }

        // 2. Block Checkout DOM checked input & label
        const $blockChecked = $('.wc-block-components-shipping-rates-control input:checked, .wc-block-components-radio-control__input:checked, .wc-block-checkout__shipping-methods input:checked, [data-block-name="woocommerce/checkout-shipping-methods-block"] input:checked, fieldset.wc-block-checkout__shipping-options input:checked');
        if ($blockChecked.length && $blockChecked.val()) {
            shipId = String($blockChecked.val()).trim();
            const $option = $blockChecked.closest('.wc-block-components-radio-control__option, label, .wc-block-components-radio-control');
            const $labelEl = $option.find('.wc-block-components-radio-control__label, .wc-block-components-radio-control__description');
            if ($labelEl.length) {
                shipTitle = $labelEl.first().text().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
            } else if ($option.length) {
                shipTitle = $option.text().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
            }
            if (shipId || shipTitle) {
                return { id: shipId, title: shipTitle, raw: shipId + ' ' + shipTitle };
            }
        }

        // 3. Checked DOM Label text fallback
        const $activeLabel = $('.wc-block-components-shipping-rates-control input:checked, .wc-block-components-radio-control__input:checked')
            .closest('label, .wc-block-components-radio-control__option, .wc-block-components-radio-control')
            .find('.wc-block-components-radio-control__label, .wc-block-components-radio-control__description');
        if ($activeLabel.length) {
            shipTitle = $activeLabel.first().text().trim();
        }

        // 4. Any other checked radio in shipping containers
        const $anyChecked = $('[class*="shipping"] input[type="radio"]:checked, tr.shipping input[type="radio"]:checked, fieldset input[type="radio"]:checked');
        if ($anyChecked.length && $anyChecked.first().val()) {
            shipId = String($anyChecked.first().val()).trim();
            const $lbl = $anyChecked.first().closest('label, tr, li, div');
            if ($lbl.length && !shipTitle) {
                shipTitle = $lbl.text().trim();
            }
        }

        // 5. WooCommerce Blocks Store API (wp.data wc/store/cart)
        if (window.wp && window.wp.data) {
            try {
                const cartSelect = window.wp.data.select('wc/store/cart');
                if (cartSelect) {
                    const cart = typeof cartSelect.getCartData === 'function' ? cartSelect.getCartData() : null;
                    if (cart && cart.shippingRates && cart.shippingRates.length) {
                        for (let pkg of cart.shippingRates) {
                            const rates = pkg.shipping_rates || (pkg.rate_id ? [pkg] : []);
                            for (let rate of rates) {
                                if (rate.selected) {
                                    if (!shipId) shipId = rate.rate_id || '';
                                    if (!shipTitle) shipTitle = rate.name || '';
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (e) { }
        }

        // 6. Single shipping method input
        const $hidden = $('input[type="hidden"][name^="shipping_method"], input[name^="shipping_method"]');
        if ($hidden.length && $hidden.length === 1 && $hidden.val()) {
            if (!shipId) shipId = String($hidden.val()).trim();
        }

        return {
            id: shipId,
            title: shipTitle,
            raw: (shipId + ' ' + shipTitle).trim()
        };
    }

    /**
     * Helper: Detect current shipping method string
     */
    function detectCurrentShippingMethod() {
        const info = detectCurrentShippingInfo();
        return info.id || info.title || info.raw || '';
    }

    /**
     * Helper: Update active rule based on current selected district and shipping method
     */
    function updateActiveRuleFromDistrict() {
        const districtCode = detectCurrentDistrictCode();
        const shipInfo = detectCurrentShippingInfo();

        const generalDelay = (settings && settings.delay_hours !== undefined) ? parseInt(settings.delay_hours, 10) : ((active_rule && active_rule.delay_hours !== undefined) ? parseInt(active_rule.delay_hours, 10) : 0);
        const generalOffDays = (settings && settings.off_days) || (active_rule && active_rule.off_days) || [];
        const generalBlackout = (settings && settings.blackout_dates) || (active_rule && active_rule.blackout_dates) || '';
        const generalAllowed = (settings && settings.allowed_dates) || (active_rule && active_rule.allowed_dates) || '';
        const generalRanges = (settings && settings.disabled_date_ranges) || (active_rule && active_rule.disabled_date_ranges) || [];

        if (!districtCode || !zone_rules || !zone_rules.length) {
            currentActiveRule = active_rule || { delay_hours: generalDelay, off_days: generalOffDays, blackout_dates: generalBlackout, allowed_dates: generalAllowed, disabled_date_ranges: generalRanges };
            currentMatrixKey = 'general_default';
            return;
        }

        let foundRule = null;
        if (districtCode) {
            for (let r of zone_rules) {
                const dList = r.districts || [];
                if (dList.includes(districtCode)) {
                    foundRule = r;
                    break;
                }
            }
        }

        if (foundRule) {
            let matchedMethod = null;
            const methods = foundRule.methods || {};
            const shipId = String(shipInfo.id || '').trim().toLowerCase();
            const cleanShipId = shipId.replace(/^\d+:/, '');
            const shipTitle = String(shipInfo.title || '').trim().toLowerCase();
            const shipRaw = String(shipInfo.raw || '').trim().toLowerCase();

            if (Object.keys(methods).length > 0) {
                // Priority 1: Exact Key Match on clean ID or full ID
                if (cleanShipId && methods[cleanShipId]) {
                    matchedMethod = methods[cleanShipId];
                } else if (shipId && methods[shipId]) {
                    matchedMethod = methods[shipId];
                }

                // Priority 2: Case-insensitive Key Match in loop
                if (!matchedMethod && (cleanShipId || shipId)) {
                    for (let mk in methods) {
                        const cleanMk = String(mk).trim().toLowerCase().replace(/^\d+:/, '');
                        if (cleanMk === cleanShipId || cleanMk === shipId || String(mk).trim().toLowerCase() === shipId) {
                            matchedMethod = methods[mk];
                            break;
                        }
                    }
                }

                // Priority 3: Exact Shipping Method Title Match
                if (!matchedMethod && shipTitle) {
                    for (let mk in methods) {
                        const mTitle = String(methods[mk].shipping_method_title || '').trim().toLowerCase();
                        if (mTitle && (mTitle === shipTitle || shipTitle.startsWith(mTitle))) {
                            matchedMethod = methods[mk];
                            break;
                        }
                    }
                }

                // Priority 4: Title Substring / Inclusion Match
                if (!matchedMethod && (shipTitle || shipRaw)) {
                    const searchStr = shipTitle || shipRaw;
                    for (let mk in methods) {
                        const mTitle = String(methods[mk].shipping_method_title || '').trim().toLowerCase();
                        if (mTitle && (searchStr.includes(mTitle) || mTitle.includes(searchStr))) {
                            matchedMethod = methods[mk];
                            break;
                        }
                    }
                }

                // Priority 5: Method ID stored inside object property
                if (!matchedMethod && (cleanShipId || shipId)) {
                    for (let mk in methods) {
                        const innerId = String(methods[mk].shipping_method_id || '').trim().toLowerCase().replace(/^\d+:/, '');
                        if (innerId && (innerId === cleanShipId || innerId === shipId)) {
                            matchedMethod = methods[mk];
                            break;
                        }
                    }
                }

                // Priority 6: Fallback to first configured method in this zone rule
                if (!matchedMethod) {
                    const firstKey = Object.keys(methods)[0];
                    matchedMethod = methods[firstKey];
                }
            }

            let ruleDelay, ruleOffDays, ruleRanges, ruleBlackout, ruleAllowed;

            if (matchedMethod) {
                ruleDelay    = matchedMethod.delay_hours !== undefined ? Math.max(0, parseInt(matchedMethod.delay_hours, 10)) : generalDelay;
                ruleOffDays  = matchedMethod.off_days !== undefined && Array.isArray(matchedMethod.off_days) ? matchedMethod.off_days : generalOffDays;
                ruleRanges   = matchedMethod.disabled_date_ranges !== undefined && Array.isArray(matchedMethod.disabled_date_ranges) ? matchedMethod.disabled_date_ranges : generalRanges;
                ruleBlackout = matchedMethod.blackout_dates !== undefined ? String(matchedMethod.blackout_dates) : generalBlackout;
                ruleAllowed  = matchedMethod.allowed_dates !== undefined ? String(matchedMethod.allowed_dates) : generalAllowed;
            } else {
                ruleDelay    = foundRule.delay_hours !== undefined ? Math.max(0, parseInt(foundRule.delay_hours, 10)) : generalDelay;
                ruleOffDays  = foundRule.off_days && foundRule.off_days.length > 0 ? foundRule.off_days : generalOffDays;
                ruleRanges   = foundRule.disabled_date_ranges && foundRule.disabled_date_ranges.length > 0 ? foundRule.disabled_date_ranges : generalRanges;
                ruleBlackout = foundRule.blackout_dates !== undefined ? String(foundRule.blackout_dates) : generalBlackout;
                ruleAllowed  = foundRule.allowed_dates !== undefined ? String(foundRule.allowed_dates) : generalAllowed;
            }

            currentActiveRule = {
                id: foundRule.id || '',
                shipping_method_id: matchedMethod ? (matchedMethod.shipping_method_id || '') : (foundRule.shipping_method_id || ''),
                shipping_method_title: matchedMethod ? (matchedMethod.shipping_method_title || '') : (foundRule.shipping_method_title || ''),
                delay_hours: ruleDelay,
                off_days: ruleOffDays,
                disabled_date_ranges: ruleRanges,
                blackout_dates: ruleBlackout,
                allowed_dates: ruleAllowed,
            };
            currentMatrixKey = foundRule.id || 'general_default';
        } else {
            currentActiveRule = {
                delay_hours: generalDelay,
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
        
        let baseDate;
        if (serverTime && serverTime.date) {
            const dateParts = String(serverTime.date).split('-').map(Number);
            const timeParts = (serverTime.time || '00:00:00').split(':').map(Number);
            baseDate = new Date(
                dateParts[0],
                dateParts[1] - 1,
                dateParts[2],
                timeParts[0] || 0,
                timeParts[1] || 0,
                timeParts[2] || 0
            );
        } else {
            baseDate = new Date();
        }

        baseDate.setHours(baseDate.getHours() + delayHours);
        return formatDateYMD(baseDate);
    }

    /**
     * Helper: Check if a valid shipping method is available and selected on checkout
     */
    function isShippingAvailable() {
        // 1. Check for warning/error banners indicating missing address or unavailable shipping
        const $noShippingBanner = $('.wc-block-components-notice-banner.is-error, .wc-block-components-notice-banner.is-warning, .woocommerce-error, .woocommerce-info, .woocommerce-no-shipping-available-html, .wc-block-components-shipping-rates-control__no-rates').filter(function () {
            const txt = $(this).text().toLowerCase();
            return txt.includes('no shipping') || txt.includes('enter a shipping address') || txt.includes('no matching shipping') || txt.includes('verify the address');
        });

        if ($noShippingBanner.length > 0) {
            return false;
        }

        // 2. Check for placeholder text inside shipping options panel
        const $shippingContainers = $('.wc-block-checkout__shipping-option, [data-block-name="woocommerce/checkout-shipping-methods-block"], fieldset.wc-block-checkout__shipping-options, tr.shipping, .woocommerce-shipping-totals, .wc-block-components-shipping-rates-control');
        if ($shippingContainers.length > 0) {
            const areaText = $shippingContainers.text().toLowerCase();
            if (areaText.includes('enter a shipping address') || areaText.includes('no shipping options are available') || areaText.includes('no shipping methods offered')) {
                return false;
            }
        }

        // 3. Check for shipping inputs in DOM
        const $shippingInputs = $('input[name^="shipping_method"], .woocommerce-shipping-methods input[type="radio"], .wc-block-components-shipping-rates-control input, .wc-block-components-radio-control__input, [data-block-name="woocommerce/checkout-shipping-methods-block"] input');
        if ($shippingInputs.length > 0) {
            const $checked = $shippingInputs.filter(':checked');
            if ($checked.length === 0) {
                return false;
            }
        }

        // 4. Check via detectCurrentShippingMethod()
        const currentMethod = detectCurrentShippingMethod();
        if (!currentMethod || !String(currentMethod).trim()) {
            // Check if cart needs shipping in Gutenberg store
            if (window.wp && window.wp.data) {
                try {
                    const cartStore = window.wp.data.select('wc/store/cart');
                    if (cartStore) {
                        const cart = typeof cartStore.getCartData === 'function' ? cartStore.getCartData() : null;
                        if (cart) {
                            if (cart.needsShipping === false) {
                                return true; // Digital / non-shippable order
                            }
                            if (cart.shippingRates && cart.shippingRates.length) {
                                let hasSelected = false;
                                for (let pkg of cart.shippingRates) {
                                    const rates = pkg.shipping_rates || (pkg.rate_id ? [pkg] : []);
                                    for (let r of rates) {
                                        if (r.selected) hasSelected = true;
                                    }
                                }
                                if (!hasSelected) return false;
                            } else {
                                return false;
                            }
                        }
                    }
                } catch (e) {}
            }

            // If shipping container exists in DOM and no method detected, shipping is not ready
            if ($shippingContainers.length > 0) {
                return false;
            }
        }

        return true;
    }

    /**
     * Helper: Toggle enabled/disabled and visible/hidden state of Delivery Date based on shipping availability
     */
    function updateDeliveryFieldState() {
        const isAvailable = isShippingAvailable();
        const $displayInput = $('#schedulify_delivery_date_display');
        const $hiddenInput = $('#schedulify_delivery_date');
        const $wrapper = $('#schedulify-delivery-scheduler-wrapper');
        const i18n = (schedulifyData && schedulifyData.i18n) || {};
        const noShippingPlaceholder = i18n.noShippingMethod || 'Please select a shipping method first...';
        const defaultPlaceholder = i18n.clickToSelect || 'Click to select a date...';

        const altInput = flatpickrInstance ? flatpickrInstance.altInput : null;

        if (!isAvailable) {
            $wrapper.hide().css('display', 'none');
            $displayInput.prop('disabled', true).addClass('schedulify-disabled').attr('placeholder', noShippingPlaceholder);
            if (altInput) {
                $(altInput).prop('disabled', true).addClass('schedulify-disabled').attr('placeholder', noShippingPlaceholder);
            }
            $wrapper.addClass('schedulify-shipping-disabled');

            if ($hiddenInput.val() || userSelectedDate) {
                $hiddenInput.val('');
                userSelectedDate = null;
                if (flatpickrInstance) {
                    flatpickrInstance.clear();
                }
                syncWithSession();
            }
            if (flatpickrInstance) {
                flatpickrInstance.close();
            }
        } else {
            $wrapper.show().css('display', 'block');
            $displayInput.prop('disabled', false).removeClass('schedulify-disabled').attr('placeholder', defaultPlaceholder);
            if (altInput) {
                $(altInput).prop('disabled', false).removeClass('schedulify-disabled').attr('placeholder', defaultPlaceholder);
            }
            $wrapper.removeClass('schedulify-shipping-disabled');
        }

        return isAvailable;
    }

    /**
     * Helper: Check if a specific date object is allowed for delivery
     */
    function isDateAllowed(dateObj) {
        if (!isShippingAvailable()) {
            return false;
        }

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
        const shippingReady = updateDeliveryFieldState();

        if (!flatpickrInstance) return;

        if (!shippingReady) {
            flatpickrInstance.clear();
            return;
        }

        const minDate = getEarliestAllowedDate();
        flatpickrInstance.set('minDate', minDate);
        flatpickrInstance.set('disable', [function (date) { return !isDateAllowed(date); }]);

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
            onOpen: function (selectedDates, dateStr, instance) {
                if (!isShippingAvailable()) {
                    instance.close();
                }
            },
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

        updateDeliveryFieldState();

        if (targetDate && isShippingAvailable()) {
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
                    const $panel = $found.closest('.wc-block-components-panel, .wp-block-woocommerce-checkout-payment-block, fieldset, form');
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

        initFlatpickr();
        updateDeliveryFieldState();
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

        // Debounce timer for district/method change events
        let ruleRefreshTimer = null;
        function debouncedRefreshCalendarRules() {
            clearTimeout(ruleRefreshTimer);
            refreshCalendarRules();
            ruleRefreshTimer = setTimeout(function () {
                refreshCalendarRules();
            }, 100);
            setTimeout(function () {
                refreshCalendarRules();
            }, 350);
            setTimeout(function () {
                refreshCalendarRules();
            }, 800);
        }

        // Listen for district / state / city changes on checkout (both Classic and Block Checkout)
        $(document).on('change input select', '#billing_state, #shipping_state, #billing_city, #shipping_city, select[id*="state"], select[id*="district"], input[id*="state"], input[id*="district"], select[name*="state"], select[name*="district"], input[name*="state"], input[name*="district"], .wc-block-components-state-input select, .wc-block-components-state-input input, .wc-block-components-combobox input, .wc-block-components-combobox__input', function () {
            debouncedRefreshCalendarRules();
        });

        // Listen for shipping method changes on checkout (both Classic and Block Checkout)
        $(document).on('change click input', 'input[name^="shipping_method"], .woocommerce-shipping-methods input[type="radio"], select[name^="shipping_method"], .wc-block-components-shipping-rates-control input[type="radio"], .wc-block-components-radio-control, .wc-block-components-radio-control__input, .wc-block-components-radio-control__option, .wc-block-components-radio-control__label, [data-block-name="woocommerce/checkout-shipping-methods-block"]', function () {
            debouncedRefreshCalendarRules();
        });

        // Subscribe to WooCommerce Gutenberg Blocks store state changes
        if (window.wp && window.wp.data && typeof window.wp.data.subscribe === 'function') {
            let lastDetectedMethod = '';
            let lastDetectedDistrict = '';
            let lastShippingState = null;
            let lastIsCalculating = null;
            window.wp.data.subscribe(function () {
                try {
                    const cartStore = window.wp.data.select('wc/store/cart');
                    const isCalculating = cartStore && typeof cartStore.isCartCalculating === 'function' ? cartStore.isCartCalculating() : false;
                    const curMethod = detectCurrentShippingMethod();
                    const curDistrict = detectCurrentDistrictCode();
                    const curShippingState = isShippingAvailable();
                    if (curMethod !== lastDetectedMethod || curDistrict !== lastDetectedDistrict || curShippingState !== lastShippingState || (lastIsCalculating === true && isCalculating === false)) {
                        lastDetectedMethod = curMethod;
                        lastDetectedDistrict = curDistrict;
                        lastShippingState = curShippingState;
                        lastIsCalculating = isCalculating;
                        refreshCalendarRules();
                    }
                } catch (e) {}
            });
        }

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

        // Re-init and update rules on AJAX completes and WooCommerce events
        $(document).ajaxComplete(function (event, xhr, settings) {
            if (settings && settings.url && (settings.url.includes('wc/store') || settings.url.includes('woocommerce') || settings.url.includes('admin-ajax.php'))) {
                debouncedRefreshCalendarRules();
            }
        });

        $(document.body).on('updated_checkout updated_shipping_method update_checkout', function () {
            mountToBlockCheckout();
            debouncedRefreshCalendarRules();
        });
    });

})(jQuery);
