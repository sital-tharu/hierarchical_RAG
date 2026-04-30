/**
 * ═══════════════════════════════════════════════════════════
 * Vectorless RAG — Frontend Application
 * Handles API interaction, progress UI, and chat interface
 * ═══════════════════════════════════════════════════════════
 */

(function () {
    'use strict';

    // ── Configuration ──
    const API_BASE = window.location.origin;

    // ── DOM References ──
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // Header
    const statusPill = $('#status-pill');
    const statusDot = $('#status-dot');
    const statusLabel = $('#status-label');

    // Tabs
    const tabBtns = $$('.tab-btn');
    const tabSlider = $('#tab-slider');
    const panels = $$('.panel');

    // Upload
    const dropZone = $('#drop-zone');
    const fileInput = $('#file-input');
    const fileInfo = $('#file-info');
    const fileInfoName = $('#file-info-name');
    const fileInfoSize = $('#file-info-size');
    const fileInfoRemove = $('#file-info-remove');
    const ingestBtn = $('#ingest-btn');
    const progressSection = $('#progress-section');
    const progressTitle = $('#progress-title');
    const progressPct = $('#progress-pct');
    const progressBarFill = $('#progress-bar-fill');
    const progressSteps = $$('.progress-step');
    const progressDetail = $('#progress-detail');
    const ingestResult = $('#ingest-result');
    const resultTitle = $('#result-title');
    const resultDetail = $('#result-detail');
    const resultPreview = $('#result-preview');
    const dropZoneContent = $('#drop-zone-content');

    // Query
    const reportSelect = $('#report-select');
    const refreshReportsBtn = $('#refresh-reports-btn');
    const chatArea = $('#chat-area');
    const chatEmpty = $('#chat-empty');
    const chatMessages = $('#chat-messages');
    const chatInput = $('#chat-input');
    const sendBtn = $('#send-btn');
    const pipelineProgress = $('#pipeline-progress');
    const exampleQueries = $$('.example-query');

    // Explorer
    const explorerLoading = $('#explorer-loading');
    const explorerEmpty = $('#explorer-empty');
    const indexGrid = $('#index-grid');
    const refreshIndicesBtn = $('#refresh-indices-btn');
    const indexModalOverlay = $('#index-modal-overlay');
    const modalTitle = $('#modal-title');
    const modalBody = $('#modal-body');
    const modalClose = $('#modal-close');

    // Footer
    const footerDot = $('#footer-dot');
    const footerModel = $('#footer-model');
    const footerReports = $('#footer-reports');

    // ── State ──
    let selectedFile = null;
    let isIngesting = false;
    let isQuerying = false;

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TOAST NOTIFICATIONS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function showToast(message, type = 'info') {
        const container = $('#toast-container');
        const icons = { success: '✅', error: '❌', info: 'ℹ️' };

        const toast = document.createElement('div');
        toast.className = `toast toast--${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type] || icons.info}</span>
            <span>${escapeHtml(message)}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('exit');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // API HELPERS
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function apiFetch(path, options = {}) {
        try {
            const url = `${API_BASE}${path}`;
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...(options.headers || {}),
                },
            });

            if (!res.ok) {
                let detail = `HTTP ${res.status}`;
                try {
                    const err = await res.json();
                    detail = err.detail || detail;
                } catch (_) {}
                throw new Error(detail);
            }

            return await res.json();
        } catch (err) {
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                throw new Error('Cannot connect to server. Is the API running?');
            }
            throw err;
        }
    }


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // HEALTH CHECK
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function checkHealth() {
        try {
            const data = await apiFetch('/');
            statusPill.classList.remove('error');
            statusLabel.textContent = `${data.model} · Running`;
            footerDot.classList.remove('offline');
            footerModel.textContent = `Model: ${data.model}`;
            return true;
        } catch (err) {
            statusPill.classList.add('error');
            statusLabel.textContent = 'Offline';
            footerDot.classList.add('offline');
            footerModel.textContent = 'Model: Disconnected';
            return false;
        }
    }

    // Poll health every 30s
    setInterval(checkHealth, 30000);


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // TAB NAVIGATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function switchTab(tabId) {
        const idx = Array.from(tabBtns).findIndex(b => b.dataset.tab === tabId);
        if (idx === -1) return;

        tabBtns.forEach(b => {
            b.classList.remove('active');
            b.setAttribute('aria-selected', 'false');
        });
        tabBtns[idx].classList.add('active');
        tabBtns[idx].setAttribute('aria-selected', 'true');

        panels.forEach(p => p.classList.remove('panel--active'));
        const panel = $(`#panel-${tabId}`);
        if (panel) panel.classList.add('panel--active');

        // Move slider
        tabSlider.style.transform = `translateX(${idx * 100}%)`;

        // Trigger data loads
        if (tabId === 'query') loadReports();
        if (tabId === 'explorer') loadIndices();
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FILE UPLOAD / DROP ZONE
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    dropZone.addEventListener('click', () => {
        if (!isIngesting) fileInput.click();
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');

        const files = e.dataTransfer.files;
        if (files.length > 0) handleFileSelect(files[0]);
    });

    fileInput.addEventListener('change', () => {
        if (fileInput.files.length > 0) handleFileSelect(fileInput.files[0]);
    });

    function handleFileSelect(file) {
        if (!file.name.toLowerCase().endsWith('.pdf')) {
            showToast('Only PDF files are accepted', 'error');
            return;
        }

        selectedFile = file;
        fileInfoName.textContent = file.name;
        fileInfoSize.textContent = formatFileSize(file.size);
        fileInfo.classList.remove('hidden');
        ingestBtn.disabled = false;

        // Reset previous results
        progressSection.classList.add('hidden');
        ingestResult.classList.add('hidden');

        showToast(`Selected: ${file.name}`, 'info');
    }

    fileInfoRemove.addEventListener('click', () => {
        selectedFile = null;
        fileInput.value = '';
        fileInfo.classList.add('hidden');
        ingestBtn.disabled = true;
    });

    function formatFileSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // INGEST WITH PROGRESS ANIMATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    const ingestSteps = [
        { key: 'upload',    label: 'Uploading PDF to server…',           pct: 10 },
        { key: 'extract',   label: 'Extracting pages from PDF…',         pct: 30 },
        { key: 'summarize', label: 'Generating AI summaries per page…',  pct: 70 },
        { key: 'index',     label: 'Building hierarchical PageIndex…',   pct: 90 },
    ];

    function setIngestProgress(stepIndex, detail) {
        const step = ingestSteps[stepIndex];

        // Update bar
        progressBarFill.style.width = step.pct + '%';
        progressPct.textContent = step.pct + '%';
        progressTitle.textContent = step.label;
        progressDetail.textContent = detail || step.label;

        // Update step dots
        progressSteps.forEach((el, i) => {
            el.classList.remove('active', 'done');
            if (i < stepIndex) el.classList.add('done');
            if (i === stepIndex) el.classList.add('active');
        });
    }

    ingestBtn.addEventListener('click', async () => {
        if (!selectedFile || isIngesting) return;

        isIngesting = true;
        ingestBtn.disabled = true;
        progressSection.classList.remove('hidden');
        ingestResult.classList.add('hidden');
        dropZone.style.display = 'none';
        fileInfo.classList.add('hidden');

        // Step 0: Upload
        setIngestProgress(0, 'Sending file to the server…');

        // Simulate step progression because the API is a single long request
        // We'll start the fetch and animate through the steps at timed intervals
        let stepTimers = [];
        let currentStep = 0;

        // Automatically advance steps during the long request
        const advanceSteps = () => {
            stepTimers.push(setTimeout(() => {
                if (!isIngesting) return;
                setIngestProgress(1, 'pypdf is parsing all pages from your report…');
            }, 2000));

            stepTimers.push(setTimeout(() => {
                if (!isIngesting) return;
                setIngestProgress(2, 'Ollama is generating structural summaries for each page — this may take a few minutes…');
            }, 5000));

            // After 15s, add encouraging messages
            const encouragements = [
                'Still working — AI is analyzing each page carefully…',
                'Processing financial tables and statements…',
                'Identifying Balance Sheet, P&L, and Notes sections…',
                'Almost there — building the complete index…',
                'Parsing FY data and Indian accounting standards…',
                'Analyzing Director\'s Report and MD&A sections…',
                'Cross-referencing Standalone vs Consolidated data…',
            ];

            let msgIdx = 0;
            stepTimers.push(setInterval(() => {
                if (!isIngesting) return;
                progressDetail.textContent = encouragements[msgIdx % encouragements.length];
                msgIdx++;
            }, 8000));
        };

        advanceSteps();

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);

            const data = await apiFetch('/ingest', {
                method: 'POST',
                body: formData,
            });

            // Clear timers
            stepTimers.forEach(t => { clearTimeout(t); clearInterval(t); });

            // Complete!
            setIngestProgress(3, 'Index built successfully!');
            progressBarFill.style.width = '100%';
            progressPct.textContent = '100%';
            progressSteps.forEach(el => {
                el.classList.remove('active');
                el.classList.add('done');
            });
            progressTitle.textContent = 'Ingestion complete!';
            progressDetail.textContent = '';

            // Show result after a beat
            setTimeout(() => {
                progressSection.classList.add('hidden');
                ingestResult.classList.remove('hidden');

                resultTitle.textContent = 'Successfully Ingested!';
                resultDetail.textContent = `${data.message} — ${data.pages_indexed} pages indexed.`;

                if (data.index_preview) {
                    resultPreview.textContent = JSON.stringify(data.index_preview, null, 2);
                } else {
                    resultPreview.classList.add('hidden');
                }

                showToast(`${selectedFile.name} ingested (${data.pages_indexed} pages)`, 'success');

                // Refresh report lists
                loadReports();
                loadIndices();
            }, 800);

        } catch (err) {
            stepTimers.forEach(t => { clearTimeout(t); clearInterval(t); });

            progressTitle.textContent = 'Ingestion failed';
            progressDetail.textContent = err.message;
            progressBarFill.style.width = '0%';
            progressPct.textContent = '✕';
            progressPct.style.color = '#ef4444';

            showToast(`Ingestion failed: ${err.message}`, 'error');
        } finally {
            isIngesting = false;
            ingestBtn.disabled = false;
            dropZone.style.display = '';

            // Show file info again with the same file
            if (selectedFile) {
                fileInfo.classList.remove('hidden');
            }

            // Reset pct color
            setTimeout(() => { progressPct.style.color = ''; }, 3000);
        }
    });


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // REPORT SELECTOR
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function loadReports() {
        try {
            const data = await apiFetch('/indices');
            const currentVal = reportSelect.value;

            // Keep the placeholder
            reportSelect.innerHTML = '<option value="" disabled>Select a report…</option>';

            if (data.indices && data.indices.length > 0) {
                data.indices.forEach(idx => {
                    const opt = document.createElement('option');
                    opt.value = idx.pdf_name;
                    opt.textContent = `${idx.pdf_name} (${idx.pages_indexed} pages)`;
                    reportSelect.appendChild(opt);
                });

                // Re-select if still valid
                if (currentVal) {
                    const exists = data.indices.find(i => i.pdf_name === currentVal);
                    if (exists) reportSelect.value = currentVal;
                }

                // If only one report, auto-select
                if (data.indices.length === 1) {
                    reportSelect.value = data.indices[0].pdf_name;
                    updateSendState();
                }
            }

            footerReports.textContent = `${data.total} report${data.total !== 1 ? 's' : ''} indexed`;
        } catch (err) {
            console.error('Failed to load reports:', err);
        }
    }

    refreshReportsBtn.addEventListener('click', () => {
        loadReports();
        showToast('Report list refreshed', 'info');
    });

    reportSelect.addEventListener('change', updateSendState);


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // QUERY / CHAT
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    function updateSendState() {
        const hasReport = reportSelect.value && reportSelect.value !== '';
        const hasText = chatInput.value.trim().length > 0;
        sendBtn.disabled = !(hasReport && hasText && !isQuerying);
    }

    chatInput.addEventListener('input', () => {
        updateSendState();
        // Auto-resize textarea
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    });

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) sendQuery();
        }
    });

    sendBtn.addEventListener('click', sendQuery);

    // Example query buttons
    exampleQueries.forEach(btn => {
        btn.addEventListener('click', () => {
            chatInput.value = btn.dataset.query;
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
            updateSendState();
            chatInput.focus();
        });
    });

    function addChatMessage(role, content, pages) {
        // Hide empty state
        chatEmpty.classList.add('hidden');
        chatMessages.style.display = '';

        const msg = document.createElement('div');
        msg.className = `chat-msg chat-msg--${role}`;

        const avatar = role === 'user' ? '👤' : '✨';
        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        let pagesHtml = '';
        if (pages && pages.length > 0) {
            pagesHtml = `
                <div class="msg-pages">
                    ${pages.map(p => `<span class="page-badge">📄 Page ${p}</span>`).join('')}
                </div>
            `;
        }

        msg.innerHTML = `
            <div class="msg-avatar">${avatar}</div>
            <div class="msg-body">
                <div class="msg-bubble">${escapeHtml(content)}</div>
                ${pagesHtml}
                <span class="msg-meta">${time}</span>
            </div>
        `;

        chatMessages.appendChild(msg);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // Pipeline step animation during query
    function showPipelineStep(stepId) {
        const steps = ['pipe-step-nav', 'pipe-step-read', 'pipe-step-expert'];
        const currentIdx = steps.indexOf(stepId);

        steps.forEach((id, i) => {
            const el = $(`#${id}`);
            el.classList.remove('active', 'done');
            if (i < currentIdx) el.classList.add('done');
            if (i === currentIdx) el.classList.add('active');
        });
    }

    async function sendQuery() {
        const question = chatInput.value.trim();
        const pdfName = reportSelect.value;

        if (!question || !pdfName || isQuerying) return;

        isQuerying = true;
        updateSendState();

        // Add user message
        addChatMessage('user', question);
        chatInput.value = '';
        chatInput.style.height = 'auto';

        // Show pipeline progress
        pipelineProgress.classList.remove('hidden');
        showPipelineStep('pipe-step-nav');

        // Simulate step progression
        let stepTimers = [];
        stepTimers.push(setTimeout(() => {
            if (!isQuerying) return;
            showPipelineStep('pipe-step-read');
        }, 3000));

        stepTimers.push(setTimeout(() => {
            if (!isQuerying) return;
            showPipelineStep('pipe-step-expert');
        }, 6000));

        try {
            const data = await apiFetch('/query', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question, pdf_name: pdfName + '.pdf' }),
            });

            stepTimers.forEach(t => clearTimeout(t));

            // Mark all steps done
            ['pipe-step-nav', 'pipe-step-read', 'pipe-step-expert'].forEach(id => {
                $(`#${id}`).classList.remove('active');
                $(`#${id}`).classList.add('done');
            });

            // Hide pipeline after a moment
            setTimeout(() => {
                pipelineProgress.classList.add('hidden');
                // Reset steps
                ['pipe-step-nav', 'pipe-step-read', 'pipe-step-expert'].forEach(id => {
                    $(`#${id}`).classList.remove('active', 'done');
                });
            }, 500);

            // Add AI response
            addChatMessage('ai', data.answer, data.selected_pages);

        } catch (err) {
            stepTimers.forEach(t => clearTimeout(t));
            pipelineProgress.classList.add('hidden');
            ['pipe-step-nav', 'pipe-step-read', 'pipe-step-expert'].forEach(id => {
                $(`#${id}`).classList.remove('active', 'done');
            });

            addChatMessage('ai', `⚠️ Error: ${err.message}`);
            showToast(`Query failed: ${err.message}`, 'error');
        } finally {
            isQuerying = false;
            updateSendState();
        }
    }


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // INDEX EXPLORER
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function loadIndices() {
        explorerLoading.classList.remove('hidden');
        explorerEmpty.classList.add('hidden');
        indexGrid.classList.add('hidden');

        try {
            const data = await apiFetch('/indices');

            explorerLoading.classList.add('hidden');

            if (!data.indices || data.indices.length === 0) {
                explorerEmpty.classList.remove('hidden');
                return;
            }

            indexGrid.classList.remove('hidden');
            indexGrid.innerHTML = '';

            data.indices.forEach((idx, i) => {
                const card = document.createElement('div');
                card.className = 'index-card';
                card.style.animationDelay = `${i * 80}ms`;
                card.innerHTML = `
                    <div class="card-icon">📊</div>
                    <div class="card-name">${escapeHtml(idx.pdf_name)}</div>
                    <div class="card-meta">
                        <span class="card-pages-badge">📄 ${idx.pages_indexed} pages</span>
                    </div>
                    <div class="card-action">View Index →</div>
                `;
                card.addEventListener('click', () => openIndexModal(idx.pdf_name));
                indexGrid.appendChild(card);
            });

            footerReports.textContent = `${data.total} report${data.total !== 1 ? 's' : ''} indexed`;

        } catch (err) {
            explorerLoading.classList.add('hidden');
            explorerEmpty.classList.remove('hidden');
            showToast(`Failed to load indices: ${err.message}`, 'error');
        }
    }

    async function openIndexModal(pdfName) {
        indexModalOverlay.classList.remove('hidden');
        modalTitle.textContent = pdfName;
        modalBody.innerHTML = `
            <div class="skeleton-grid" style="grid-template-columns: 1fr;">
                <div class="skeleton-card" style="height:60px;"></div>
                <div class="skeleton-card" style="height:60px;"></div>
                <div class="skeleton-card" style="height:60px;"></div>
            </div>
        `;

        try {
            const data = await apiFetch(`/index/${encodeURIComponent(pdfName)}`);

            modalBody.innerHTML = '';

            if (data.index) {
                const entries = Object.entries(data.index);
                entries.forEach(([pageNum, info]) => {
                    const item = document.createElement('div');
                    item.className = 'modal-page-item';
                    item.innerHTML = `
                        <div class="modal-page-num">Page ${info.page}</div>
                        <div class="modal-page-summary">${escapeHtml(info.summary)}</div>
                        <div class="modal-page-chars">${info.char_count.toLocaleString()} characters</div>
                    `;
                    modalBody.appendChild(item);
                });
            }
        } catch (err) {
            modalBody.innerHTML = `<p style="color:var(--accent-red); text-align:center; padding:2rem;">
                Failed to load index: ${escapeHtml(err.message)}</p>`;
        }
    }

    // Close modal
    modalClose.addEventListener('click', () => {
        indexModalOverlay.classList.add('hidden');
    });

    indexModalOverlay.addEventListener('click', (e) => {
        if (e.target === indexModalOverlay) {
            indexModalOverlay.classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !indexModalOverlay.classList.contains('hidden')) {
            indexModalOverlay.classList.add('hidden');
        }
    });

    refreshIndicesBtn.addEventListener('click', () => {
        loadIndices();
        showToast('Indices refreshed', 'info');
    });


    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // INITIALIZATION
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    async function init() {
        // Health check
        await checkHealth();

        // Load initial data
        loadReports();
        loadIndices();

        // Set initial tab slider position
        tabSlider.style.transform = 'translateX(0)';
    }

    init();

})();
