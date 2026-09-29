/**
 * Schedulify Delivery - Admin Settings Script
 */
(function ($) {
    'use strict';

    $(document).ready(function () {
        // Tab Navigation
        $('.schedulify-nav-tabs li').on('click', function () {
            const tabId = $(this).data('tab');

            $('.schedulify-nav-tabs li').removeClass('active');
            $(this).addClass('active');

            $('.schedulify-tab-content').removeClass('active');
            $('#schedulify-tab-' + tabId).addClass('active');

            // Update URL query param without full page reload
            if (window.history && window.history.replaceState) {
                const url = new URL(window.location.href);
                url.searchParams.set('tab', tabId);
                window.history.replaceState({}, '', url.toString());
            }
        });

        // ==========================================
        // DATE RANGE REPEATER (GENERAL TAB)
        // ==========================================
        $(document).on('click', '.schedulify-add-range', function () {
            const $list = $('#schedulify-general-disabled-ranges').find('.schedulify-ranges-list');
            const newIndex = new Date().getTime();

            const rangeHtml = `
                <div class="schedulify-range-row" style="display:none;">
                    <div class="schedulify-range-field">
                        <label>From:</label>
                        <input type="date" name="disabled_date_ranges[${newIndex}][start]" value="" required>
                    </div>
                    <div class="schedulify-range-field">
                        <label>To:</label>
                        <input type="date" name="disabled_date_ranges[${newIndex}][end]" value="" required>
                    </div>
                    <div class="schedulify-range-field schedulify-range-reason">
                        <label>Reason (Optional):</label>
                        <input type="text" name="disabled_date_ranges[${newIndex}][reason]" value="" placeholder="e.g. Eid Vacation / Maintenance">
                    </div>
                    <button type="button" class="button schedulify-remove-range" title="Delete Range">
                        <span class="dashicons dashicons-trash"></span>
                    </button>
                </div>
            `;

            const $newRow = $(rangeHtml);
            $list.append($newRow);
            $newRow.fadeIn(150);
            $newRow.find('input[type="date"]').first().focus();
        });

        // ==========================================
        // DATE RANGE REPEATER (ZONE MODAL)
        // ==========================================
        $(document).on('click', '.schedulify-add-range-zone', function () {
            addZoneRangeRow('', '', '');
        });

        function addZoneRangeRow(start = '', end = '', reason = '') {
            const $list = $('#schedulify-zone-ranges-list');
            const newIndex = new Date().getTime() + Math.floor(Math.random() * 1000);

            const rangeHtml = `
                <div class="schedulify-range-row" style="display:none;">
                    <div class="schedulify-range-field">
                        <label>From:</label>
                        <input type="date" name="zone_disabled_date_ranges[${newIndex}][start]" value="${start}" required>
                    </div>
                    <div class="schedulify-range-field">
                        <label>To:</label>
                        <input type="date" name="zone_disabled_date_ranges[${newIndex}][end]" value="${end}" required>
                    </div>
                    <div class="schedulify-range-field schedulify-range-reason">
                        <label>Reason (Optional):</label>
                        <input type="text" name="zone_disabled_date_ranges[${newIndex}][reason]" value="${reason}" placeholder="e.g. Vacation / Courier off">
                    </div>
                    <button type="button" class="button schedulify-remove-range" title="Delete Range">
                        <span class="dashicons dashicons-trash"></span>
                    </button>
                </div>
            `;

            const $newRow = $(rangeHtml);
            $list.append($newRow);
            $newRow.fadeIn(150);
        }

        // Remove Date Range (General & Zone)
        $(document).on('click', '.schedulify-remove-range', function () {
            const $row = $(this).closest('.schedulify-range-row');
            $row.fadeOut(150, function () {
                $row.remove();
            });
        });

        // ==========================================
        // ZONE VISIBILITY & FILTERING
        // ==========================================
        function updateZoneCardsVisibility(currentRuleId) {
            currentRuleId = currentRuleId || '';
            const zoneRules = ((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).zoneRules) || [];
            const assignedZones = new Set();

            zoneRules.forEach(function (r) {
                if (!currentRuleId || r.id !== currentRuleId) {
                    if (Array.isArray(r.districts)) {
                        r.districts.forEach(function (code) {
                            assignedZones.add(String(code));
                        });
                    }
                }
            });

            const query = ($('#schedulify-district-search').val() || '').toLowerCase().trim();
            let unassignedCount = 0;
            let visibleCount = 0;

            $('.schedulify-district-card').each(function () {
                const $card = $(this);
                const code = String($card.find('.schedulify-district-checkbox').val() || '');
                const name = ($card.attr('data-district-name') || '').toLowerCase();

                if (assignedZones.has(code)) {
                    $card.addClass('schedulify-zone-hidden-assigned').hide();
                    $card.removeClass('selected').find('.schedulify-district-checkbox').prop('checked', false);
                } else {
                    $card.removeClass('schedulify-zone-hidden-assigned');
                    unassignedCount++;
                    if (!query || name.indexOf(query) !== -1) {
                        $card.show();
                        visibleCount++;
                    } else {
                        $card.hide();
                    }
                }
            });

            if (unassignedCount === 0) {
                $('#schedulify-no-zones-notice').show();
                $('#schedulify-no-search-results').hide();
                $('#schedulify-select-all-districts, #schedulify-deselect-all-districts').prop('disabled', true);
            } else {
                $('#schedulify-no-zones-notice').hide();
                $('#schedulify-select-all-districts, #schedulify-deselect-all-districts').prop('disabled', false);
                if (visibleCount === 0 && query) {
                    $('#schedulify-no-search-results').show();
                } else {
                    $('#schedulify-no-search-results').hide();
                }
            }
        }

        // Search Filter
        $(document).on('keyup input', '#schedulify-district-search', function () {
            const query = $(this).val().toLowerCase().trim();
            let visibleCount = 0;
            const $unassignedCards = $('.schedulify-district-card:not(.schedulify-zone-hidden-assigned)');

            if ($unassignedCards.length === 0) {
                return;
            }

            $unassignedCards.each(function () {
                const name = $(this).attr('data-district-name') || '';
                if (!query || name.indexOf(query) !== -1) {
                    $(this).show();
                    visibleCount++;
                } else {
                    $(this).hide();
                }
            });

            if (visibleCount === 0 && query) {
                $('#schedulify-no-search-results').show();
            } else {
                $('#schedulify-no-search-results').hide();
            }
        });

        // Select All Visible Zones
        $(document).on('click', '#schedulify-select-all-districts', function () {
            $('.schedulify-district-card:visible').each(function () {
                $(this).addClass('selected').find('.schedulify-district-checkbox').prop('checked', true);
            });
        });

        // Deselect All Available Zones
        $(document).on('click', '#schedulify-deselect-all-districts', function () {
            $('.schedulify-district-card:not(.schedulify-zone-hidden-assigned)').removeClass('selected').find('.schedulify-district-checkbox').prop('checked', false);
        });

        // Zone Checkbox Card click highlighting
        $(document).on('change', '.schedulify-district-checkbox', function () {
            const $card = $(this).closest('.schedulify-district-card');
            if ($(this).is(':checked')) {
                $card.addClass('selected');
            } else {
                $card.removeClass('selected');
            }
        });

        // ==========================================
        // MULTI-STEP ZONE RULE MODAL
        // ==========================================
        const $modal = $('#schedulify-zone-modal');
        const $step1 = $('#schedulify-modal-step-1');
        const $step2 = $('#schedulify-modal-step-2');
        const $btnNext = $('#schedulify-modal-btn-next');
        const $btnSave = $('#schedulify-modal-btn-save');

        function openModal(isEdit = false) {
            $modal.fadeIn(150);
            $('body').addClass('modal-open');
            if (!isEdit) {
                resetModalForm();
                goToStep(1);
            }
        }

        function closeModal() {
            $modal.fadeOut(150);
            $('body').removeClass('modal-open');
        }

        function goToStep(step, targetMethodId) {
            if (step === 1) {
                $step2.hide();
                $step1.fadeIn(150);
                $('.schedulify-step-dot[data-step="1"]').addClass('active');
                $('.schedulify-step-dot[data-step="2"]').removeClass('active');
                $btnSave.hide();
                $btnNext.show();
            } else if (step === 2) {
                // Collect selected zones for pills
                const $pillsContainer = $('#schedulify-selected-zones-pills');
                $pillsContainer.empty();
                const selectedDistricts = [];
                $('.schedulify-district-checkbox:checked').each(function () {
                    const code = $(this).val();
                    const name = $(this).closest('.schedulify-district-card').find('.schedulify-district-info strong').text().trim();
                    if (name) {
                        $pillsContainer.append(`<span class="schedulify-pill" data-zone-code="${code}">${name} <span class="schedulify-pill-remove" title="Remove">&times;</span></span>`);
                    }
                    if (code) {
                        selectedDistricts.push(code);
                    }
                });

                const selectedMethod = (targetMethodId !== undefined && targetMethodId !== null)
                    ? targetMethodId
                    : ($('#schedulify_zone_shipping_method').val() || '');

                // Dynamically fetch and populate shipping methods via AJAX
                fetchShippingMethods(selectedDistricts, selectedMethod);

                $step1.hide();
                $step2.fadeIn(150);
                $('.schedulify-step-dot[data-step="1"]').removeClass('active');
                $('.schedulify-step-dot[data-step="2"]').addClass('active');
                $btnNext.hide();
                $btnSave.show();
            }
        }

        // ==========================================
        // DYNAMIC SHIPPING METHODS VIA AJAX
        // ==========================================
        let currentShippingAjax = null;

        function fetchShippingMethods(selectedZones, targetMethodId) {
            const $select = $('#schedulify_zone_shipping_method');
            targetMethodId = targetMethodId || '';

            if (currentShippingAjax && currentShippingAjax.readyState !== 4) {
                currentShippingAjax.abort();
            }

            $select.prop('disabled', true).html('<option value="" disabled selected>⏳ Loading shipping methods...</option>');

            currentShippingAjax = $.ajax({
                url: ((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).ajax_url) || ajaxurl,
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'schedulify_get_shipping_methods_by_zones',
                    nonce: ((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).nonce) || '',
                    zones: selectedZones || [],
                    current_method: targetMethodId
                },
                success: function (res) {
                    $select.empty();
                    $select.append('<option value="" disabled selected>-- Select Shipping Method --</option>');

                    if (res && res.success && res.data && res.data.methods && res.data.methods.length > 0) {
                        let matchFound = false;
                        res.data.methods.forEach(function (m) {
                            const $opt = $('<option></option>')
                                .val(m.id)
                                .text(m.label)
                                .attr('data-title', m.title || '')
                                .attr('data-zone-name', m.zone_name || '');

                            if (targetMethodId && m.id === targetMethodId) {
                                $opt.prop('selected', true);
                                matchFound = true;
                            }
                            $select.append($opt);
                        });

                        if (matchFound) {
                            $select.val(targetMethodId);
                        } else if (res.data.methods.length === 1) {
                            $select.val(res.data.methods[0].id);
                        } else {
                            $select.val('');
                        }
                    } else {
                        $select.append('<option value="" disabled>No shipping methods found</option>');
                    }

                    const selTitle = $select.find('option:selected').data('title') || '';
                    $('#schedulify_zone_shipping_method_title').val(selTitle);
                    $select.prop('disabled', false);
                },
                error: function (xhr, status) {
                    if (status !== 'abort') {
                        $select.empty();
                        $select.append('<option value="" disabled selected>-- Select Shipping Method --</option>');
                        $select.append('<option value="" disabled>Could not load methods. Please retry.</option>');
                        $select.prop('disabled', false);
                    }
                }
            });
        }

        // Navigate between steps via step indicator
        $(document).on('click', '.schedulify-step-dot[data-step="1"]', function () {
            goToStep(1);
        });

        $(document).on('click', '.schedulify-step-dot[data-step="2"]', function () {
            const checkedCount = $('.schedulify-district-checkbox:checked').length;
            if (checkedCount === 0) {
                alert(((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).i18n && (window.schedulifyAdminData || window.schedulifyAdminData).i18n.selectZoneError) || 'Please select at least one zone.');
                return;
            }
            goToStep(2);
        });

        // "Change / Modify Zones" button in Step 2 pill bar
        $(document).on('click', '#schedulify-btn-change-zones', function () {
            goToStep(1);
        });

        // Individual Pill Remove (x)
        $(document).on('click', '.schedulify-pill-remove', function (e) {
            e.stopPropagation();
            const $pill = $(this).closest('.schedulify-pill');
            const code = $pill.attr('data-zone-code');
            $(`.schedulify-district-checkbox[value="${code}"]`).prop('checked', false).closest('.schedulify-district-card').removeClass('selected');
            $pill.fadeOut(150, function () {
                $(this).remove();
                const remainingDistricts = [];
                $('.schedulify-district-checkbox:checked').each(function () {
                    remainingDistricts.push($(this).val());
                });
                if (remainingDistricts.length === 0) {
                    goToStep(1);
                } else {
                    fetchShippingMethods(remainingDistricts, $('#schedulify_zone_shipping_method').val() || '');
                }
            });
        });

        function resetModalForm() {
            $('#schedulify_modal-title').text('Add Zone Delivery Rule');
            $('#schedulify_rule_id').val('');
            $('#schedulify-district-search').val('');
            $('.schedulify-district-checkbox').prop('checked', false).closest('.schedulify-district-card').removeClass('selected');
            updateZoneCardsVisibility('');
            $('#schedulify_zone_shipping_method').empty().append('<option value="" disabled selected>-- Select Shipping Method --</option>');
            $('#schedulify_zone_shipping_method_title').val('');
            $('#schedulify_zone_delay_hours').val('');
            $('.schedulify-zone-off-day').prop('checked', false);
            $('#schedulify_zone_blackout').val('');
            $('#schedulify_zone_allowed').val('');
            $('#schedulify-zone-ranges-list').empty();
        }

        // Update hidden shipping method title when shipping method select changes
        $(document).on('change', '#schedulify_zone_shipping_method', function () {
            const title = $(this).find('option:selected').data('title') || '';
            $('#schedulify_zone_shipping_method_title').val(title);
        });

        // Open Modal (Add New)
        $(document).on('click', '.schedulify-open-zone-modal, #schedulify-btn-add-zone', function () {
            openModal(false);
        });

        // Close Modal only when clicking the Close [x] button
        $(document).on('click', '.schedulify-modal-close', function () {
            closeModal();
        });

        // Step 1 -> Next Click
        $btnNext.on('click', function () {
            const checkedCount = $('.schedulify-district-checkbox:checked').length;
            if (checkedCount === 0) {
                alert(((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).i18n && (window.schedulifyAdminData || window.schedulifyAdminData).i18n.selectZoneError) || 'Please select at least one zone.');
                return;
            }
            goToStep(2);
        });

        // Edit Zone Rule Click
        $(document).on('click', '.schedulify-edit-rule', function (e) {
            e.preventDefault();
            const $tr = $(this).closest('tr');
            const ruleJson = $tr.attr('data-rule-json');
            if (!ruleJson) return;

            try {
                const rule = JSON.parse(ruleJson);
                resetModalForm();

                $('#schedulify_modal-title').text('Edit Zone Delivery Rule');
                $('#schedulify_rule_id').val(rule.id || '');

                // Show cards for current rule + unassigned, hide cards assigned to other rules
                updateZoneCardsVisibility(rule.id || '');

                // Check assigned zones
                const districts = rule.districts || [];
                $('.schedulify-district-checkbox').each(function () {
                    const dval = $(this).val();
                    if (districts.includes(dval)) {
                        $(this).prop('checked', true).closest('.schedulify-district-card').addClass('selected');
                    }
                });

                // Populate Step 2 fields
                $('#schedulify_zone_shipping_method_title').val(rule.shipping_method_title || '');
                $('#schedulify_zone_delay_hours').val(rule.delay_hours !== undefined ? rule.delay_hours : '');

                const offDays = (rule.off_days || []).map(Number);
                $('.schedulify-zone-off-day').each(function () {
                    const dayVal = parseInt($(this).val(), 10);
                    $(this).prop('checked', offDays.includes(dayVal));
                });

                $('#schedulify_zone_blackout').val(rule.blackout_dates || '');
                $('#schedulify_zone_allowed').val(rule.allowed_dates || '');

                // Populate Date Ranges
                $('#schedulify-zone-ranges-list').empty();
                if (rule.disabled_date_ranges && Array.isArray(rule.disabled_date_ranges)) {
                    rule.disabled_date_ranges.forEach(function (range) {
                        addZoneRangeRow(range.start || '', range.end || '', range.reason || '');
                    });
                }

                openModal(true);
                goToStep(2, rule.shipping_method_id || '');
            } catch (err) {
                console.error('Failed to parse rule json:', err);
            }
        });

        // Form Submit Validation
        $(document).on('submit', '#schedulify-zone-rule-form', function (e) {
            const checkedCount = $('.schedulify-district-checkbox:checked').length;
            if (checkedCount === 0) {
                e.preventDefault();
                alert(((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).i18n && (window.schedulifyAdminData || window.schedulifyAdminData).i18n.selectZoneError) || 'Please select at least one zone.');
                goToStep(1);
                return false;
            }

            // Validate Shipping Method
            const methodVal = ($('#schedulify_zone_shipping_method').val() || '').trim();
            if (!methodVal) {
                e.preventDefault();
                alert(((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).i18n && (window.schedulifyAdminData || window.schedulifyAdminData).i18n.methodRequired) || 'Please select a shipping method.');
                goToStep(2);
                $('#schedulify_zone_shipping_method').focus();
                return false;
            }

            // Sync shipping method title
            const methodTitle = $('#schedulify_zone_shipping_method option:selected').data('title') || '';
            $('#schedulify_zone_shipping_method_title').val(methodTitle);

            const delayVal = ($('#schedulify_zone_delay_hours').val() || '').trim();
            const delayNum = parseInt(delayVal, 10);
            if (delayVal === '' || isNaN(delayNum) || delayNum < 0) {
                e.preventDefault();
                alert(((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).i18n && (window.schedulifyAdminData || window.schedulifyAdminData).i18n.delayRequired) || 'Please enter a valid Delivery Delay in Hours (0 or more).');
                goToStep(2);
                $('#schedulify_zone_delay_hours').focus();
                return false;
            }
        });

        // Delete Zone Rule Confirmation
        $(document).on('click', '.schedulify-delete-rule', function (e) {
            const confirmMsg = ((window.schedulifyAdminData || window.schedulifyAdminData) && (window.schedulifyAdminData || window.schedulifyAdminData).i18n && (window.schedulifyAdminData || window.schedulifyAdminData).i18n.confirmDelete) || 'Are you sure you want to delete this zone rule?';
            if (!confirm(confirmMsg)) {
                e.preventDefault();
            }
        });
    });

})(jQuery);
