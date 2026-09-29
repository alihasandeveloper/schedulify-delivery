/**
 * Schedulify Multi-Step Checkout Handler
 * Supports both WooCommerce Gutenberg Block Checkout and Classic Shortcode Checkout
 * Version: 3.0.0
 */
(function ($) {
    'use strict';

    var SchedulifyMultiStep = {
        currentStep: 1,
        isStep1Completed: false,
        isBlockCheckout: false,
        blockCheckTimer: null,

        init: function () {
            $(document).ready(this.onReady.bind(this));
        },

        onReady: function () {
            var self = this;

            // Apply initial step 1 body class immediately
            $('body').addClass('schedulify-step-1-active').removeClass('schedulify-step-2-active');

            // 1. Detect Block Checkout
            if ($('.wp-block-woocommerce-checkout, .wc-block-checkout').length) {
                this.isBlockCheckout = true;
                this.initBlockCheckout();
            } else if ($('#schedulify-step-1-content').length) {
                // 2. Classic Checkout
                this.initClassicCheckout();
            } else {
                // Polling for dynamic Block Checkout mount
                var attempts = 0;
                this.blockCheckTimer = setInterval(function () {
                    attempts++;
                    if ($('.wp-block-woocommerce-checkout, .wc-block-checkout').length) {
                        clearInterval(self.blockCheckTimer);
                        self.isBlockCheckout = true;
                        self.initBlockCheckout();
                    } else if (attempts > 25) {
                        clearInterval(self.blockCheckTimer);
                    }
                }, 150);
            }

            this.bindGlobalEvents();
        },

        /**
         * Initialize for Gutenberg Block Checkout
         */
        initBlockCheckout: function () {
            var self = this;

            this.injectBlockElements();
            this.applyBlockStepVisibility(1);

            // Re-apply on every React DOM update
            var blockObserver = new MutationObserver(function () {
                self.injectBlockElements();
                self.applyBlockStepVisibility(self.currentStep);
            });

            var targetNode = document.querySelector('.wc-block-checkout, .wp-block-woocommerce-checkout');
            if (targetNode) {
                blockObserver.observe(targetNode, { childList: true, subtree: true });
            }
        },

        /**
         * Inject Next Button & Step 2 Back Button
         */
        injectBlockElements: function () {
            var $main = $('.wc-block-checkout__main, .wc-block-checkout, .wp-block-woocommerce-checkout').first();
            if (!$main.length) return;

            // 1. Find all possible Step 1 blocks (Contact, Shipping, Billing, Additional notes)
            var $allStep1Blocks = $main.find([
                '.wc-block-checkout__contact-information',
                '.wc-block-components-checkout-contact-information-block',
                '[data-block-name*="contact-information"]',
                '.wc-block-checkout__shipping-fields',
                '.wc-block-components-checkout-shipping-address-block',
                '[data-block-name*="shipping-address"]',
                'fieldset.wc-block-checkout__shipping-fields',
                '.wc-block-checkout__billing-fields',
                '.wc-block-components-checkout-billing-address-block',
                '[data-block-name*="billing-address"]',
                'fieldset.wc-block-checkout__billing-fields',
                '.wc-block-checkout__additional-fields',
                '.wc-block-components-checkout-additional-fields-block',
                '[data-block-name*="additional-fields"]',
                '[data-block-name*="order-notes"]'
            ].join(', '));

            var $step1Last = $allStep1Blocks.last();

            if ($step1Last.length) {
                if (!$('#schedulify-block-next-container').length) {
                    var nextBtnHtml = '<div id="schedulify-block-next-container" class="schedulify-step-actions schedulify-step-1-actions">' +
                        '<button type="button" class="button alt schedulify-btn schedulify-btn-next" id="schedulify-block-to-step-2-btn">' +
                        '<span>Next: Shipping & Payment</span>' +
                        '</button></div>';

                    $step1Last.after(nextBtnHtml);
                } else {
                    if (!$step1Last.next().is('#schedulify-block-next-container')) {
                        $step1Last.after($('#schedulify-block-next-container'));
                    }
                }
            }

            // 2. Back Button at the top of Step 2 (above Shipping options)
            var $step2First = $main.find('.wc-block-checkout__shipping-methods, fieldset.wc-block-checkout__shipping-options, .wc-block-components-shipping-rates-control, [data-block-name*="shipping-methods"], [data-block-name*="shipping-method"], #schedulify-delivery-scheduler-wrapper, #schedulify-block-fallback-container').first();

            if ($step2First.length && !$('#schedulify-block-back-top-container').length) {
                var backBtnHtml = '<div id="schedulify-block-back-top-container" class="schedulify-step-top-nav">' +
                    '<button type="button" class="schedulify-btn-back" id="schedulify-block-back-btn">' +
                    '<span>Back</span>' +
                    '</button>' +
                    '</div>';

                $step2First.before(backBtnHtml);
            }
        },

        /**
         * Partition and strictly toggle visibility of all Block Checkout sections
         */
        applyBlockStepVisibility: function (step) {
            this.currentStep = step;

            // Select all Step 1 blocks
            var $step1Elements = $([
                '.wc-block-checkout__contact-information',
                '.wc-block-components-checkout-contact-information-block',
                '[data-block-name*="contact-information"]',
                '.wc-block-checkout__shipping-fields',
                '.wc-block-components-checkout-shipping-address-block',
                '[data-block-name*="shipping-address"]',
                'fieldset.wc-block-checkout__shipping-fields',
                '.wc-block-checkout__billing-fields',
                '.wc-block-components-checkout-billing-address-block',
                '[data-block-name*="billing-address"]',
                'fieldset.wc-block-checkout__billing-fields',
                '#schedulify-block-next-container'
            ].join(', '));

            // Select all Step 2 blocks
            var $step2Elements = $([
                '#schedulify-block-back-top-container',
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
                '.wc-block-checkout__additional-fields',
                '.wc-block-components-checkout-additional-fields-block',
                'fieldset.wc-block-checkout__additional-fields',
                '[data-block-name*="additional-fields"]',
                '[data-block-name*="order-notes"]',
                '.wc-block-checkout__terms-and-conditions',
                '.wc-block-components-checkout-terms-and-conditions-block',
                '[data-block-name*="terms-and-conditions"]',
                '.wc-block-checkout__actions',
                '.wc-block-components-checkout-place-order-button',
                '[data-block-name*="actions"]'
            ].join(', '));

            if (step === 1) {
                $('body').addClass('schedulify-step-1-active').removeClass('schedulify-step-2-active');

                $step1Elements.each(function () {
                    $(this).removeClass('schedulify-is-hidden').show().css('display', '');
                });

                $step2Elements.each(function () {
                    $(this).addClass('schedulify-is-hidden').hide().css('display', 'none');
                });
            } else if (step === 2) {
                $('body').addClass('schedulify-step-2-active').removeClass('schedulify-step-1-active');

                $step1Elements.each(function () {
                    $(this).addClass('schedulify-is-hidden').hide().css('display', 'none');
                });

                $step2Elements.each(function () {
                    $(this).removeClass('schedulify-is-hidden').show().css('display', '');
                });
            }
        },

        /**
         * Initialize for Classic Shortcode Checkout
         */
        initClassicCheckout: function () {
            this.goToStepClassic(1, false);
        },

        bindGlobalEvents: function () {
            var self = this;

            // Classic Next Button
            $(document).on('click', '#schedulify-to-step-2-btn', function (e) {
                e.preventDefault();
                if (self.validateClassicStep1()) {
                    self.isStep1Completed = true;
                    self.goToStepClassic(2, true);
                    $(document.body).trigger('update_checkout');
                }
            });

            // Classic Back Buttons
            $(document).on('click', '#schedulify-back-to-step-1-btn, #schedulify-back-to-step-1-top-btn', function (e) {
                e.preventDefault();
                self.goToStepClassic(1, true);
            });

            // Block Next Button
            $(document).on('click', '#schedulify-block-to-step-2-btn', function (e) {
                e.preventDefault();
                if (self.validateBlockStep1()) {
                    self.isStep1Completed = true;
                    self.applyBlockStepVisibility(2);

                    // Scroll to top of checkout
                    var $main = $('.wc-block-checkout__main, .wc-block-checkout, .wp-block-woocommerce-checkout').first();
                    if ($main.length) {
                        $('html, body').animate({
                            scrollTop: $main.offset().top - 40
                        }, 300);
                    }

                    // Trigger shipping & matrix calculation updates
                    $(document.body).trigger('update_checkout');
                }
            });

            // Block Back Button (Top of Step 2)
            $(document).on('click', '#schedulify-block-back-btn', function (e) {
                e.preventDefault();
                self.applyBlockStepVisibility(1);
                var $main = $('.wc-block-checkout__main, .wc-block-checkout, .wp-block-woocommerce-checkout').first();
                if ($main.length) {
                    $('html, body').animate({
                        scrollTop: $main.offset().top - 40
                    }, 300);
                }
            });

            // Re-align button position when billing address or order notes checkbox is toggled
            $(document).on('change', 'input[type="checkbox"], select', function () {
                setTimeout(function () {
                    self.injectBlockElements();
                    self.applyBlockStepVisibility(self.currentStep);
                }, 50);
            });

            // Auto-clear validation errors
            $(document).on('input change', '.schedulify-validation-error, input, select', function () {
                $(this).removeClass('schedulify-validation-error');
                if ($('.schedulify-validation-error').length === 0) {
                    $('.schedulify-error-notice').remove();
                }
            });
        },

        /**
         * Step 1 Validation for Block Checkout
         */
        validateBlockStep1: function () {
            var isValid = true;
            var $firstErrorField = null;
            $('.schedulify-error-notice').remove();
            $('.schedulify-validation-error').removeClass('schedulify-validation-error');

            var $step1Blocks = $('.wc-block-checkout__contact-information, .wc-block-components-checkout-contact-information-block, .wc-block-checkout__shipping-fields, .wc-block-components-checkout-shipping-address-block, .wc-block-checkout__billing-fields, .wc-block-components-checkout-billing-address-block');

            // 1. Validate all standard visible inputs in Step 1
            $step1Blocks.find('input:visible, select:visible, textarea:visible').each(function () {
                var $input = $(this);
                if ($input.is(':disabled') || $input.attr('type') === 'hidden' || $input.attr('type') === 'checkbox') {
                    return;
                }

                var isOptional = $input.attr('id') && ($input.attr('id').indexOf('address_2') !== -1 || $input.attr('id').indexOf('company') !== -1 || $input.attr('id').indexOf('apartment') !== -1);
                if (isOptional) {
                    return;
                }

                var isRequired = $input.prop('required') ||
                    $input.attr('aria-required') === 'true' ||
                    $input.closest('.is-required').length > 0 ||
                    $input.attr('id') === 'email' ||
                    $input.attr('type') === 'email' ||
                    ($input.attr('id') && ($input.attr('id').indexOf('first_name') !== -1 || $input.attr('id').indexOf('last_name') !== -1 || $input.attr('id').indexOf('address_1') !== -1 || $input.attr('id').indexOf('phone') !== -1 || $input.attr('id').indexOf('city') !== -1 || $input.attr('id').indexOf('state') !== -1 || $input.attr('id').indexOf('district') !== -1));

                var val = $.trim($input.val());

                if (isRequired && (!val || val === '' || val.toLowerCase().includes('select a') || val.toLowerCase().includes('choose a'))) {
                    isValid = false;
                    $input.addClass('schedulify-validation-error');
                    $input.closest('.wc-block-components-combobox, .wc-block-components-text-input, .wc-block-components-state-input').addClass('schedulify-validation-error');
                    if (!$firstErrorField) {
                        $firstErrorField = $input;
                    }
                }

                if (isValid && ($input.attr('type') === 'email' || $input.attr('id') === 'email') && val !== '') {
                    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(val)) {
                        isValid = false;
                        $input.addClass('schedulify-validation-error');
                        $input.closest('.wc-block-components-text-input').addClass('schedulify-validation-error');
                        if (!$firstErrorField) {
                            $firstErrorField = $input;
                        }
                    }
                }
            });

            // 2. Explicit District / State validation check
            var hasDistrict = false;
            var $districtInput = $step1Blocks.find('select[id*="state"], select[id*="district"], .wc-block-components-state-input select, .wc-block-components-combobox__input, .wc-block-components-combobox input, input[id*="state"], input[id*="district"]').first();

            if ($districtInput.length) {
                var dVal = $.trim($districtInput.val());
                if (dVal && dVal !== 'default' && !dVal.toLowerCase().includes('select a') && !dVal.toLowerCase().includes('choose a')) {
                    hasDistrict = true;
                }
            }

            // Fallback check from cart data
            if (!hasDistrict && window.wp && window.wp.data) {
                try {
                    var cartStore = window.wp.data.select('wc/store/cart');
                    if (cartStore) {
                        var cart = typeof cartStore.getCartData === 'function' ? cartStore.getCartData() : null;
                        if (cart && cart.shippingAddress && cart.shippingAddress.state && String(cart.shippingAddress.state).trim() !== '') {
                            hasDistrict = true;
                        }
                    }
                } catch (e) { }
            }

            if (!hasDistrict) {
                isValid = false;
                if ($districtInput.length) {
                    $districtInput.addClass('schedulify-validation-error');
                    $districtInput.closest('.wc-block-components-combobox, .wc-block-components-state-input').addClass('schedulify-validation-error');
                    if (!$firstErrorField) {
                        $firstErrorField = $districtInput;
                    }
                }
            }

            if (!isValid && $firstErrorField) {
                var errorMsg = (window.schedulify_multistep_params && window.schedulify_multistep_params.i18n.required_field)
                    ? window.schedulify_multistep_params.i18n.required_field
                    : 'Please fill in all required fields (including District) before proceeding.';

                var noticeHtml = '<div class="schedulify-error-notice"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>' + errorMsg + '</span></div>';

                var $main = $('.wc-block-checkout__main, .wc-block-checkout, .wp-block-woocommerce-checkout').first();
                $main.prepend(noticeHtml);

                $('html, body').animate({
                    scrollTop: $firstErrorField.offset().top - 120
                }, 350);

                $firstErrorField.focus();
            }

            return isValid;
        },

        /**
         * Step 1 Validation for Classic Checkout
         */
        validateClassicStep1: function () {
            var isValid = true;
            var $firstErrorField = null;
            var $step1 = $('#schedulify-step-1-content');

            $('.schedulify-error-notice').remove();
            $step1.find('.schedulify-validation-error').removeClass('schedulify-validation-error');

            $step1.find('.validate-required, p.form-row.validate-required').each(function () {
                var $row = $(this);
                if (!$row.is(':visible')) {
                    return;
                }

                var $input = $row.find('input, select, textarea').not(':disabled, [type="hidden"]');
                if (!$input.length) {
                    return;
                }

                var val = $.trim($input.val());

                if (val === '' || val === null) {
                    isValid = false;
                    $input.addClass('schedulify-validation-error');
                    if (!$firstErrorField) {
                        $firstErrorField = $input;
                    }
                }

                if (isValid && $row.hasClass('validate-email') && val !== '') {
                    var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                    if (!emailRegex.test(val)) {
                        isValid = false;
                        $input.addClass('schedulify-validation-error');
                        if (!$firstErrorField) {
                            $firstErrorField = $input;
                        }
                    }
                }
            });

            if (!isValid && $firstErrorField) {
                var errorMsg = (window.schedulify_multistep_params && window.schedulify_multistep_params.i18n.required_field)
                    ? window.schedulify_multistep_params.i18n.required_field
                    : 'Please fill in all required fields before proceeding.';

                var noticeHtml = '<div class="schedulify-error-notice"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>' + errorMsg + '</span></div>';

                $step1.prepend(noticeHtml);

                $('html, body').animate({
                    scrollTop: $firstErrorField.offset().top - 120
                }, 350);

                $firstErrorField.focus();
            }

            return isValid;
        },

        /**
         * Switch Steps in Classic Checkout
         */
        goToStepClassic: function (step, scrollToTop) {
            this.currentStep = step;

            var $step1Content = $('#schedulify-step-1-content');
            var $step2Content = $('#schedulify-step-2-content');

            if (step === 1) {
                $('body').addClass('schedulify-step-1-active').removeClass('schedulify-step-2-active');
                $step1Content.addClass('active').show();
                $step2Content.removeClass('active').hide();
            } else if (step === 2) {
                $('body').addClass('schedulify-step-2-active').removeClass('schedulify-step-1-active');
                $step1Content.removeClass('active').hide();
                $step2Content.addClass('active').show();
            }

            if (scrollToTop) {
                var $main = $('.woocommerce-checkout');
                if ($main.length) {
                    $('html, body').animate({
                        scrollTop: $main.offset().top - 40
                    }, 300);
                }
            }
        }
    };

    SchedulifyMultiStep.init();

})(jQuery);
