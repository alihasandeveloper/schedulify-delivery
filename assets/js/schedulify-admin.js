/**
 * Schedulify Delivery - Admin Settings Script
 */
(function ($) {
    'use strict';

    $(document).ready(function () {
        const adminData = window.schedulifyAdminData || {};
        const i18n = adminData.i18n || {};
        const daysOfWeek = adminData.daysOfWeek || {
            0: 'Sunday (রবিবার)',
            1: 'Monday (সোমবার)',
            2: 'Tuesday (মঙ্গলবার)',
            3: 'Wednesday (বুধবার)',
            4: 'Thursday (বৃহস্পতিবার)',
            5: 'Friday (শুক্রবার)',
            6: 'Saturday (শনিবার)'
        };

        // Tab Navigation for General vs Zone Settings
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
            const zoneRules = adminData.zoneRules || [];
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

        let currentEditingRule = null;
        let currentShippingAjax = null;

        function openModal(isEdit) {
            $modal.fadeIn(150);
            $('body').addClass('modal-open');
            if (!isEdit) {
                currentEditingRule = null;
                resetModalForm();
                goToStep(1);
            }
        }

        function closeModal() {
            $modal.fadeOut(150);
            $('body').removeClass('modal-open');
            currentEditingRule = null;
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

                // Fetch shipping methods and render dynamic tabs
                fetchShippingMethodsAndRenderTabs(selectedDistricts, targetMethodId);

                $step1.hide();
                $step2.fadeIn(150);
                $('.schedulify-step-dot[data-step="1"]').removeClass('active');
                $('.schedulify-step-dot[data-step="2"]').addClass('active');
                $btnNext.hide();
                $btnSave.show();
            }
        }

        // ==========================================
        // DYNAMIC TABS RENDERING VIA AJAX
        // ==========================================
        function fetchShippingMethodsAndRenderTabs(selectedZones, targetMethodId) {
            const $tabsNav = $('#schedulify-method-tabs-nav');
            const $tabsContent = $('#schedulify-method-tabs-content');

            if (currentShippingAjax && currentShippingAjax.readyState !== 4) {
                currentShippingAjax.abort();
            }

            const loadingText = i18n.loadingMethods || 'Loading shipping methods...';
            $tabsNav.html('<div class="schedulify-methods-loading"><span class="spinner is-active" style="float:none; margin:0 8px 0 0; visibility:visible;"></span> ' + loadingText + '</div>');
            $tabsContent.empty();

            currentShippingAjax = $.ajax({
                url: adminData.ajax_url || (typeof ajaxurl !== 'undefined' ? ajaxurl : '/wp-admin/admin-ajax.php'),
                type: 'POST',
                dataType: 'json',
                data: {
                    action: 'schedulify_get_shipping_methods_by_zones',
                    nonce: adminData.nonce || '',
                    zones: selectedZones || [],
                    current_method: targetMethodId || (currentEditingRule ? currentEditingRule.shipping_method_id : '')
                },
                success: function (res) {
                    $tabsNav.empty();
                    $tabsContent.empty();

                    const methods = (res && res.success && res.data && res.data.methods) ? res.data.methods : [];
                    const existingRules = (res && res.success && res.data && res.data.existing_rules) ? res.data.existing_rules : {};

                    if (methods.length === 0) {
                        const noFoundText = i18n.noMethodsFound || 'No shipping methods found for the selected zone(s).';
                        $tabsNav.html('<div class="schedulify-empty-methods-notice"><span class="dashicons dashicons-warning"></span> ' + noFoundText + '</div>');
                        return;
                    }

                    // Determine active tab
                    let activeMethodKey = '';
                    if (targetMethodId) {
                        for (let i = 0; i < methods.length; i++) {
                            if (methods[i].id === targetMethodId) {
                                activeMethodKey = targetMethodId;
                                break;
                            }
                        }
                    }
                    if (!activeMethodKey && currentEditingRule) {
                        for (let i = 0; i < methods.length; i++) {
                            if (methods[i].id === currentEditingRule.shipping_method_id) {
                                activeMethodKey = currentEditingRule.shipping_method_id;
                                break;
                            }
                        }
                    }
                    if (!activeMethodKey) {
                        activeMethodKey = methods[0].id;
                    }

                    // Render Tabs and Panes
                    methods.forEach(function (m, idx) {
                        const safeId = m.id.replace(/[^a-zA-Z0-9_-]/g, '_');
                        const isActive = (m.id === activeMethodKey);

                        // Check if rule data exists
                        let savedRule = null;
                        if (currentEditingRule && currentEditingRule.methods && currentEditingRule.methods[m.id]) {
                            savedRule = currentEditingRule.methods[m.id];
                        } else if (existingRules && existingRules[m.id]) {
                            savedRule = existingRules[m.id];
                        } else if (currentEditingRule && (currentEditingRule.shipping_method_id === m.id || currentEditingRule.shipping_method_id === 'all')) {
                            savedRule = currentEditingRule;
                        }

                        const savedDelay = (savedRule && savedRule.delay_hours !== undefined) ? savedRule.delay_hours : '0';
                        const savedOffDays = (savedRule && Array.isArray(savedRule.off_days)) ? savedRule.off_days.map(Number) : [];
                        const savedBlackout = (savedRule && savedRule.blackout_dates) ? savedRule.blackout_dates : '';
                        const savedAllowed = (savedRule && savedRule.allowed_dates) ? savedRule.allowed_dates : '';
                        const savedRanges = (savedRule && Array.isArray(savedRule.disabled_date_ranges)) ? savedRule.disabled_date_ranges : [];
                        const savedRuleId = (savedRule && savedRule.id) ? savedRule.id : '';

                        // 1. Tab Button
                        const $tabBtn = $(`
                            <button type="button" class="schedulify-method-tab-btn ${isActive ? 'active' : ''}" data-target="#tab-pane-${safeId}" data-method-id="${m.id}">
                                <span class="schedulify-tab-title-text" title="${m.title}">${m.title}</span>
                                ${m.zone_name ? `<span class="schedulify-tab-zone-tag">${m.zone_name}</span>` : ''}
                            </button>
                        `);
                        $tabsNav.append($tabBtn);

                        // 2. Off-Days Checkboxes HTML
                        let offDaysHtml = '';
                        for (let d = 0; d <= 6; d++) {
                            const dayLabel = daysOfWeek[d] || `Day ${d}`;
                            const isChecked = savedOffDays.includes(d) ? 'checked' : '';
                            offDaysHtml += `
                                <label class="schedulify-checkbox-item">
                                    <input type="checkbox" name="methods[${m.id}][off_days][]" value="${d}" class="schedulify-pane-off-day" ${isChecked}>
                                    ${dayLabel}
                                </label>
                            `;
                        }

                        // 3. Tab Pane HTML
                        const $pane = $(`
                            <div class="schedulify-method-tab-pane ${isActive ? 'active' : ''}" id="tab-pane-${safeId}" data-method-id="${m.id}" data-method-title="${m.title}">
                                <!-- Hidden fields -->
                                <input type="hidden" name="methods[${m.id}][shipping_method_id]" value="${m.id}">
                                <input type="hidden" name="methods[${m.id}][shipping_method_title]" value="${m.title}">
                                <input type="hidden" name="methods[${m.id}][rule_id]" value="${savedRuleId}" class="schedulify-pane-rule-id">

                                <!-- Pane Fields Container -->
                                <div class="schedulify-pane-fields-body">
                                    <!-- Delivery Delay Hours -->
                                    <div class="schedulify-form-row schedulify-highlight-field">
                                        <label>
                                            <strong>${i18n.delayHours || 'Delivery Delay (in Hours)'} <span class="required">*</span></strong>
                                        </label>
                                        <div class="schedulify-delay-input-group">
                                            <input type="number" 
                                                   name="methods[${m.id}][delay_hours]" 
                                                   class="schedulify-pane-delay regular-text" 
                                                   min="0" 
                                                   step="1" 
                                                   value="${savedDelay}" 
                                                   placeholder="e.g. 0 for Same-Day, 24 for Standard"
                                                   required>
                                            <span class="schedulify-input-unit">${i18n.hoursUnit || 'Hours'}</span>
                                        </div>
                                        <p class="description">
                                            ${i18n.sameDayHint || 'Earliest available delivery date based on (Current Time + Delay Hours). 0 = Same-Day allowed, 24 = Next Day, 48 = 2 Days Lead Time.'}
                                        </p>
                                    </div>

                                    <!-- Weekly Off-Days -->
                                    <div class="schedulify-form-row">
                                        <label><strong>${i18n.weeklyOffDays || 'Weekly Off-Days'}</strong></label>
                                        <fieldset class="schedulify-checkbox-grid">
                                            ${offDaysHtml}
                                        </fieldset>
                                        <p class="description">Selected days will be blocked in the calendar for customers choosing this shipping method.</p>
                                    </div>

                                    <!-- Disabled Date Ranges -->
                                    <div class="schedulify-form-row">
                                        <label><strong>${i18n.disabledRanges || 'Disabled Date Ranges'}</strong></label>
                                        <div class="schedulify-ranges-container" data-method-id="${m.id}">
                                            <div class="schedulify-ranges-list"></div>
                                            <button type="button" class="button button-secondary schedulify-pane-add-range" data-method-id="${m.id}">
                                                <span class="dashicons dashicons-plus-alt2"></span> ${i18n.addDateRange || 'Add Date Range'}
                                            </button>
                                        </div>
                                    </div>

                                    <!-- Blackout Dates -->
                                    <div class="schedulify-form-row">
                                        <label><strong>${i18n.blackoutDates || 'Blackout / Holiday Dates'}</strong></label>
                                        <textarea name="methods[${m.id}][blackout_dates]" rows="2" class="schedulify-pane-blackout large-text code" placeholder="2026-12-16, 2026-12-25">${savedBlackout}</textarea>
                                        <p class="description">Comma or newline separated dates (YYYY-MM-DD) when delivery is not available for this method.</p>
                                    </div>

                                    <!-- Allowed Dates Exceptions -->
                                    <div class="schedulify-form-row">
                                        <label><strong>${i18n.allowedDates || 'Allowed Delivery Dates (Exceptions)'}</strong></label>
                                        <textarea name="methods[${m.id}][allowed_dates]" rows="2" class="schedulify-pane-allowed large-text code" placeholder="2026-03-15, 2026-03-30">${savedAllowed}</textarea>
                                        <p class="description">Comma or newline separated dates (YYYY-MM-DD) that should always be allowed regardless of off-days.</p>
                                    </div>
                                </div>
                            </div>
                        `);

                        // Populate existing date ranges in this pane
                        const $rangesList = $pane.find('.schedulify-ranges-list');
                        if (savedRanges && savedRanges.length > 0) {
                            savedRanges.forEach(function (range) {
                                addPaneRangeRow($rangesList, m.id, range.start || '', range.end || '', range.reason || '');
                            });
                        }

                        $tabsContent.append($pane);
                    });
                },
                error: function (xhr, status) {
                    if (status !== 'abort') {
                        $tabsNav.html('<div class="schedulify-empty-methods-notice error"><span class="dashicons dashicons-warning"></span> Could not load shipping methods. Please retry.</div>');
                    }
                }
            });
        }

        // Helper to add date range row for a specific method tab
        function addPaneRangeRow($list, methodId, start, end, reason) {
            start = start || '';
            end = end || '';
            reason = reason || '';
            const newIndex = new Date().getTime() + Math.floor(Math.random() * 1000);
            const rangeHtml = `
                <div class="schedulify-range-row" style="display:none;">
                    <div class="schedulify-range-field">
                        <label>From:</label>
                        <input type="date" name="methods[${methodId}][disabled_date_ranges][${newIndex}][start]" value="${start}" required>
                    </div>
                    <div class="schedulify-range-field">
                        <label>To:</label>
                        <input type="date" name="methods[${methodId}][disabled_date_ranges][${newIndex}][end]" value="${end}" required>
                    </div>
                    <div class="schedulify-range-field schedulify-range-reason">
                        <label>Reason (Optional):</label>
                        <input type="text" name="methods[${methodId}][disabled_date_ranges][${newIndex}][reason]" value="${reason}" placeholder="e.g. Vacation / Courier off">
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

        // Add range in tab pane
        $(document).on('click', '.schedulify-pane-add-range', function () {
            const methodId = $(this).data('method-id');
            const $list = $(this).closest('.schedulify-ranges-container').find('.schedulify-ranges-list');
            addPaneRangeRow($list, methodId);
        });

        // Tab Switch Button Click
        $(document).on('click', '.schedulify-method-tab-btn', function () {
            const targetSelector = $(this).data('target');

            $('.schedulify-method-tab-btn').removeClass('active');
            $(this).addClass('active');

            $('.schedulify-method-tab-pane').removeClass('active');
            $(targetSelector).addClass('active');
        });

        // "Copy Settings to All Methods" Button
        $(document).on('click', '.schedulify-btn-copy-to-all', function () {
            const $sourcePane = $(this).closest('.schedulify-method-tab-pane');
            const sourceDelay = $sourcePane.find('.schedulify-pane-delay').val();
            const sourceOffDays = [];
            $sourcePane.find('.schedulify-pane-off-day:checked').each(function () {
                sourceOffDays.push($(this).val());
            });
            const sourceBlackout = $sourcePane.find('.schedulify-pane-blackout').val();
            const sourceAllowed = $sourcePane.find('.schedulify-pane-allowed').val();

            // Collect date ranges
            const sourceRanges = [];
            $sourcePane.find('.schedulify-range-row').each(function () {
                const start = $(this).find('input[type="date"]').eq(0).val();
                const end = $(this).find('input[type="date"]').eq(1).val();
                const reason = $(this).find('input[type="text"]').val();
                if (start && end) {
                    sourceRanges.push({ start: start, end: end, reason: reason });
                }
            });

            // Copy to all other panes
            $('.schedulify-method-tab-pane').each(function () {
                if ($(this).is($sourcePane)) return;

                const $targetPane = $(this);
                const targetMethodId = $targetPane.data('method-id');

                // Set delay
                $targetPane.find('.schedulify-pane-delay').val(sourceDelay);

                // Set off-days
                $targetPane.find('.schedulify-pane-off-day').each(function () {
                    $(this).prop('checked', sourceOffDays.includes($(this).val()));
                });

                // Set blackout and allowed dates
                $targetPane.find('.schedulify-pane-blackout').val(sourceBlackout);
                $targetPane.find('.schedulify-pane-allowed').val(sourceAllowed);

                // Replicate date ranges
                const $targetList = $targetPane.find('.schedulify-ranges-list');
                $targetList.empty();
                sourceRanges.forEach(function (r) {
                    addPaneRangeRow($targetList, targetMethodId, r.start, r.end, r.reason);
                });
            });

            // Show temporary toast feedback on the button
            const $btn = $(this);
            const originalHtml = $btn.html();
            $btn.html('<span class="dashicons dashicons-yes-alt" style="color:#16a34a;"></span> ' + (i18n.copySuccess || 'Copied!'));
            setTimeout(function () {
                $btn.html(originalHtml);
            }, 2000);
        });

        // Navigate between steps via step indicator
        $(document).on('click', '.schedulify-step-dot[data-step="1"]', function () {
            goToStep(1);
        });

        $(document).on('click', '.schedulify-step-dot[data-step="2"]', function () {
            const checkedCount = $('.schedulify-district-checkbox:checked').length;
            if (checkedCount === 0) {
                alert(i18n.selectZoneError || 'Please select at least one zone.');
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
                    fetchShippingMethodsAndRenderTabs(remainingDistricts);
                }
            });
        });

        function resetModalForm() {
            currentEditingRule = null;
            $('#schedulify-modal-title').text('Add Zone Delivery Rule');
            $('#schedulify_rule_id').val('');
            $('#schedulify-district-search').val('');
            $('.schedulify-district-checkbox').prop('checked', false).closest('.schedulify-district-card').removeClass('selected');
            updateZoneCardsVisibility('');
            $('#schedulify-method-tabs-nav').empty();
            $('#schedulify-method-tabs-content').empty();
        }

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
                alert(i18n.selectZoneError || 'Please select at least one zone.');
                return;
            }
            goToStep(2);
        });

        // Edit Zone Rule Click from Table
        $(document).on('click', '.schedulify-edit-rule', function (e) {
            e.preventDefault();
            const $tr = $(this).closest('tr');
            const ruleJson = $tr.attr('data-rule-json');
            if (!ruleJson) return;

            try {
                const rule = JSON.parse(ruleJson);
                currentEditingRule = rule;
                resetModalForm();

                $('#schedulify-modal-title').text('Edit Zone Delivery Rule');
                $('#schedulify_rule_id').val(rule.id || '');

                // Show cards for current rule + unassigned, hide cards assigned to other rules
                updateZoneCardsVisibility(rule.id || '');

                // Check assigned zones
                const districts = rule.districts || [];
                $('.schedulify-district-checkbox').each(function () {
                    const dval = $(this).val();
                    if (districts.indexOf(dval) !== -1) {
                        $(this).prop('checked', true).closest('.schedulify-district-card').addClass('selected');
                    }
                });

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
                alert(i18n.selectZoneError || 'Please select at least one zone.');
                goToStep(1);
                return false;
            }

            const $panes = $('.schedulify-method-tab-pane');
            if ($panes.length === 0) {
                e.preventDefault();
                alert(i18n.noMethodsFound || 'No shipping methods available to configure.');
                goToStep(2);
                return false;
            }

            // Validate that every pane has a valid delay hours number
            let hasError = false;
            $panes.each(function () {
                const $pane = $(this);
                const delayVal = ($pane.find('.schedulify-pane-delay').val() || '').trim();
                const delayNum = parseInt(delayVal, 10);

                if (delayVal === '' || isNaN(delayNum) || delayNum < 0) {
                    e.preventDefault();
                    hasError = true;
                    alert(i18n.delayRequired || 'Please enter a valid Delivery Delay in Hours (0 or more) for all shipping methods.');
                    goToStep(2);

                    // Switch to this pane
                    const targetId = '#' + $pane.attr('id');
                    $(`.schedulify-method-tab-btn[data-target="${targetId}"]`).trigger('click');
                    $pane.find('.schedulify-pane-delay').focus();
                    return false;
                }
            });

            if (hasError) {
                return false;
            }
        });

        // Delete Zone Rule Confirmation
        $(document).on('click', '.schedulify-delete-rule', function (e) {
            const confirmMsg = i18n.confirmDelete || 'Are you sure you want to delete this zone rule?';
            if (!confirm(confirmMsg)) {
                e.preventDefault();
            }
        });
    });

})(jQuery);
