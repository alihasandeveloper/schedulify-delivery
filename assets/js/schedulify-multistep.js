/**
 * Schedulify Dynamic District Reveal Handler
 * Automatically reveals Shipping Methods, Delivery Date Scheduler & Payment Options
 * immediately upon customer district selection. No next/back buttons required.
 * Version: 4.0.0
 */
(function ($) {
    'use strict';

    var SchedulifyDistrictReveal = {
        hasDistrict: false,
        lastDistrictCode: '',

        init: function () {
            $(document).ready(this.onReady.bind(this));
        },

        onReady: function () {
            var self = this;

            // Initial check
            this.evaluateDistrict();

            // Bind change listeners on all district/state inputs and comboboxes
            this.bindEvents();

            // Observe dynamic Gutenberg Block Checkout mutations with debounce
            var debounceMutation = null;
            var observer = new MutationObserver(function (mutations) {
                var isRelevant = false;
                for (var i = 0; i < mutations.length; i++) {
                    var target = mutations[i].target;
                    if (target && !$(target).closest('.flatpickr-calendar, #schedulify-delivery-scheduler-wrapper').length) {
                        isRelevant = true;
                        break;
                    }
                }
                if (!isRelevant) {
                    return;
                }

                clearTimeout(debounceMutation);
                debounceMutation = setTimeout(function () {
                    self.evaluateDistrict();
                }, 100);
            });

            var targetNode = document.querySelector('.wc-block-checkout, .wp-block-woocommerce-checkout, form.woocommerce-checkout');
            if (targetNode) {
                observer.observe(targetNode, { childList: true, subtree: true });
            }
        },

        bindEvents: function () {
            var self = this;
            var debounceTimer = null;

            function debouncedEvaluate() {
                clearTimeout(debounceTimer);
                debounceTimer = setTimeout(function () {
                    self.evaluateDistrict();
                }, 80);
            }

            // Listen to all possible district/state change events
            $(document).on('change input select', 'select[id*="state"], select[id*="district"], input[id*="state"], input[id*="district"], .wc-block-components-state-input select, .wc-block-components-combobox__input, .wc-block-components-combobox input, #shipping_state, #billing_state, #shipping_city, #billing_city', debouncedEvaluate);

            // Subscribe to Gutenberg store if available (only evaluate if state actually changes)
            if (window.wp && window.wp.data && typeof window.wp.data.subscribe === 'function') {
                var lastStoreDistrict = null;
                window.wp.data.subscribe(function () {
                    var curDistrict = self.detectSelectedDistrict();
                    if (curDistrict !== lastStoreDistrict) {
                        lastStoreDistrict = curDistrict;
                        debouncedEvaluate();
                    }
                });
            }

            // Also check on AJAX complete (ignore internal schedulify session calls to prevent loops)
            $(document).ajaxComplete(function (event, xhr, settings) {
                if (settings && settings.data && typeof settings.data === 'string' && settings.data.indexOf('schedulify_update_session') !== -1) {
                    return;
                }
                if (settings && settings.url && (settings.url.includes('wc/store') || settings.url.includes('woocommerce'))) {
                    debouncedEvaluate();
                }
            });
        },

        /**
         * Detect if a valid district is currently selected in checkout
         */
        detectSelectedDistrict: function () {
            var districtCode = '';

            // 1. Check select elements
            var $stateSelect = $('select[id*="state"], select[id*="district"], .wc-block-components-state-input select, #shipping_state:visible, #shipping_state, #billing_state:visible, #billing_state').first();
            if ($stateSelect.length) {
                var selVal = $.trim($stateSelect.val());
                if (selVal && selVal !== 'default' && selVal !== '0' && !selVal.toLowerCase().includes('select a') && !selVal.toLowerCase().includes('choose a')) {
                    districtCode = selVal;
                }
            }

            // 2. Check combobox input elements
            if (!districtCode) {
                var $comboInput = $('.wc-block-components-combobox__input, .wc-block-components-combobox input, input[id*="state"], input[id*="district"]').first();
                if ($comboInput.length) {
                    var comboVal = $.trim($comboInput.val());
                    if (comboVal && !comboVal.toLowerCase().includes('select a') && !comboVal.toLowerCase().includes('choose a')) {
                        districtCode = comboVal;
                    }
                }
            }

            // 3. Fallback: Check Gutenberg wp.data store
            if (!districtCode && window.wp && window.wp.data) {
                try {
                    var cartStore = window.wp.data.select('wc/store/cart');
                    if (cartStore) {
                        var cart = typeof cartStore.getCartData === 'function' ? cartStore.getCartData() : null;
                        if (cart && cart.shippingAddress && cart.shippingAddress.state && String(cart.shippingAddress.state).trim() !== '') {
                            districtCode = cart.shippingAddress.state;
                        }
                    }
                } catch (e) { }
            }

            return districtCode;
        },

        /**
         * Evaluate district presence and toggle Shipping & Payment visibility
         */
        evaluateDistrict: function () {
            var currentDistrict = this.detectSelectedDistrict();
            var isValidDistrict = Boolean(currentDistrict && String(currentDistrict).trim() !== '');

            if (isValidDistrict) {
                if (!this.hasDistrict || this.lastDistrictCode !== currentDistrict) {
                    this.hasDistrict = true;
                    this.lastDistrictCode = currentDistrict;
                    this.revealShippingAndPayment();
                }
            } else {
                if (this.hasDistrict || !$('body').hasClass('schedulify-district-pending')) {
                    this.hasDistrict = false;
                    this.lastDistrictCode = '';
                    this.hideShippingAndPayment();
                }
            }
        },

        /**
         * Reveal Shipping, Delivery Date Calendar & Payment Options
         */
        revealShippingAndPayment: function () {
            $('body').addClass('schedulify-district-selected').removeClass('schedulify-district-pending');

            var $revealElements = $([
                'fieldset.wc-block-checkout__shipping-options',
                '.wc-block-checkout__shipping-option',
                '.wc-block-checkout__shipping-methods',
                '.wc-block-components-shipping-rates-control',
                '[data-block-name*="shipping-methods"]',
                '[data-block-name*="shipping-method"]',
                '#schedulify-delivery-scheduler-wrapper',
                '#schedulify-block-fallback-container',
                '#schedulify-delivery-field-container',
                '.schedulify-checkout-field-container',
                'fieldset.wc-block-checkout__payment-methods',
                '.wc-block-checkout__payment-methods',
                '.wc-block-components-checkout-payment-methods-block',
                '[data-block-name*="payment"]',
                '.wc-block-checkout__actions',
                '.wc-block-components-checkout-place-order-button',
                '[data-block-name*="actions"]',
                '#order_review_heading',
                '#order_review',
                '.woocommerce-checkout-review-order'
            ].join(', '));

            $revealElements.each(function () {
                $(this).show().css('display', '');
            });
        },

        /**
         * Hide Shipping, Delivery Date Calendar & Payment Options
         */
        hideShippingAndPayment: function () {
            $('body').addClass('schedulify-district-pending').removeClass('schedulify-district-selected');

            var $hideElements = $([
                'fieldset.wc-block-checkout__shipping-options',
                '.wc-block-checkout__shipping-option',
                '.wc-block-checkout__shipping-methods',
                '.wc-block-components-shipping-rates-control',
                '[data-block-name*="shipping-methods"]',
                '[data-block-name*="shipping-method"]',
                '#schedulify-delivery-scheduler-wrapper',
                '#schedulify-block-fallback-container',
                '#schedulify-delivery-field-container',
                '.schedulify-checkout-field-container',
                'fieldset.wc-block-checkout__payment-methods',
                '.wc-block-checkout__payment-methods',
                '.wc-block-components-checkout-payment-methods-block',
                '[data-block-name*="payment"]',
                '.wc-block-checkout__actions',
                '.wc-block-components-checkout-place-order-button',
                '[data-block-name*="actions"]',
                '#order_review_heading',
                '#order_review',
                '.woocommerce-checkout-review-order'
            ].join(', '));

            $hideElements.each(function () {
                $(this).hide().css('display', 'none');
            });
        }
    };

    SchedulifyDistrictReveal.init();

})(jQuery);
