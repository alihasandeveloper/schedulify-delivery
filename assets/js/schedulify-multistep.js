/**
 * Schedulify Multi-Step Checkout Handler
 * Version: 1.0.0
 */
(function ($) {
    'use strict';

    var SchedulifyMultiStep = {
        currentStep: 1,
        isStep1Completed: false,

        init: function () {
            $(document).ready(this.onReady.bind(this));
        },

        onReady: function () {
            // Check if multi-step markup exists
            if (!$('#schedulify-multistep-wizard').length) {
                return;
            }

            this.bindEvents();
            this.goToStep(1, false);
        },

        bindEvents: function () {
            var self = this;

            // Next button from Step 1 -> Step 2
            $(document).on('click', '#schedulify-to-step-2-btn', function (e) {
                e.preventDefault();
                if (self.validateStep1()) {
                    self.isStep1Completed = true;
                    self.goToStep(2, true);

                    // Trigger WooCommerce checkout update so shipping & fees recalculate
                    $(document.body).trigger('update_checkout');
                }
            });

            // Back button from Step 2 -> Step 1
            $(document).on('click', '#schedulify-back-to-step-1-btn, #schedulify-back-to-step-1-top-btn', function (e) {
                e.preventDefault();
                self.goToStep(1, true);
            });

            // Progress Bar Click Navigation
            $(document).on('click', '.schedulify-wizard-step', function () {
                var targetStep = parseInt($(this).data('step'), 10);
                if (targetStep === 1) {
                    self.goToStep(1, true);
                } else if (targetStep === 2) {
                    if (self.validateStep1()) {
                        self.isStep1Completed = true;
                        self.goToStep(2, true);
                        $(document.body).trigger('update_checkout');
                    }
                }
            });

            // Remove validation error on user input
            $(document).on('input change', '.schedulify-validation-error', function () {
                $(this).removeClass('schedulify-validation-error');
                if ($('.schedulify-validation-error').length === 0) {
                    $('.schedulify-error-notice').remove();
                }
            });
        },

        /**
         * Validates all required inputs in Step 1 (Billing & Shipping)
         */
        validateStep1: function () {
            var isValid = true;
            var $firstErrorField = null;
            var $step1 = $('#schedulify-step-1-content');

            // Remove previous error notices
            $('.schedulify-error-notice').remove();
            $step1.find('.schedulify-validation-error').removeClass('schedulify-validation-error');

            // Check all visible required fields in Step 1
            $step1.find('.validate-required, p.form-row.validate-required').each(function () {
                var $row = $(this);
                // Check if row is visible (e.g. shipping address is conditionally visible)
                if (!$row.is(':visible')) {
                    return;
                }

                var $input = $row.find('input, select, textarea').not(':disabled, [type="hidden"]');
                if (!$input.length) {
                    return;
                }

                var val = $.trim($input.val());

                // Required check
                if (val === '' || val === null) {
                    isValid = false;
                    $input.addClass('schedulify-validation-error');
                    if (!$firstErrorField) {
                        $firstErrorField = $input;
                    }
                }

                // Email validation check
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
                    : 'Please complete all required fields before proceeding.';

                var noticeHtml = '<div class="schedulify-error-notice"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg> <span>' + errorMsg + '</span></div>';
                
                $step1.prepend(noticeHtml);

                $('html, body').animate({
                    scrollTop: $firstErrorField.offset().top - 120
                }, 400);

                $firstErrorField.focus();
            }

            return isValid;
        },

        /**
         * Switch between Step 1 and Step 2
         */
        goToStep: function (step, scrollToTop) {
            this.currentStep = step;

            var $wizard = $('#schedulify-multistep-wizard');
            var $step1Badge = $wizard.find('.step-1');
            var $step2Badge = $wizard.find('.step-2');
            var $step1Content = $('#schedulify-step-1-content');
            var $step2Content = $('#schedulify-step-2-content');

            if (step === 1) {
                $step1Content.addClass('active').show();
                $step2Content.removeClass('active').hide();

                $step1Badge.addClass('active').removeClass('completed');
                $step2Badge.removeClass('active completed');
                $wizard.removeClass('step-2-active');
            } else if (step === 2) {
                $step1Content.removeClass('active').hide();
                $step2Content.addClass('active').show();

                $step1Badge.removeClass('active').addClass('completed');
                $step2Badge.addClass('active');
                $wizard.addClass('step-2-active');
            }

            if (scrollToTop && $wizard.length) {
                $('html, body').animate({
                    scrollTop: $wizard.offset().top - 80
                }, 350);
            }
        }
    };

    SchedulifyMultiStep.init();

})(jQuery);
