function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

function parseRichText(text) {
    if (!text) return '';
    let escaped = escapeHTML(text);
    
    // 1. Links
    escaped = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" class="text-blue-600 dark:text-blue-400 hover:underline" onclick="event.stopPropagation()">$1</a>');
    
    // 2. Checkboxes
    escaped = escaped.replace(/^(\s*)\[x\]\s+(.*)$/gm, '<label class="flex items-start gap-2 cursor-pointer mt-1" onclick="event.stopPropagation()"><input type="checkbox" checked class="mt-1 shrink-0 accent-blue-600"><span>$2</span></label>');
    escaped = escaped.replace(/^(\s*)\[ \]\s+(.*)$/gm, '<label class="flex items-start gap-2 cursor-pointer mt-1" onclick="event.stopPropagation()"><input type="checkbox" class="mt-1 shrink-0 accent-blue-600"><span>$2</span></label>');
    
    // 3. Headings
    escaped = escaped.replace(/^###\s+(.*)$/gm, '<h3 class="text-lg font-semibold mt-2 mb-1">$1</h3>');
    escaped = escaped.replace(/^##\s+(.*)$/gm, '<h2 class="text-xl font-bold mt-3 mb-1">$1</h2>');
    escaped = escaped.replace(/^#\s+(.*)$/gm, '<h1 class="text-2xl font-extrabold mt-4 mb-2">$1</h1>');
    
    // 4. Bold / Italic
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold">$1</strong>');
    escaped = escaped.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>');

    // 5. Newlines to <br>
    escaped = escaped.replace(/\n/g, '<br>');
    
    // Clean up <br> after block tags
    escaped = escaped.replace(/<\/h1><br>/g, '</h1>');
    escaped = escaped.replace(/<\/h2><br>/g, '</h2>');
    escaped = escaped.replace(/<\/h3><br>/g, '</h3>');
    escaped = escaped.replace(/<\/label><br>/g, '</label>');

    return escaped;
}

document.addEventListener('DOMContentLoaded', () => {
    const statusContainer = document.getElementById('status-container');
    const statusMessage = document.getElementById('status-message');
    const loginBtn = document.getElementById('login-btn');
    const contentContainer = document.getElementById('content-container');
    const notesList = document.getElementById('notes-list');
    const refreshBtn = document.getElementById('refresh-btn');
    const userProfile = document.getElementById('user-profile');
    const userAvatar = document.getElementById('user-avatar');
    const userEmail = document.getElementById('user-email');
    const noteTitleInput = document.getElementById('note-title');
    const noteBodyInput = document.getElementById('note-body');
    const saveNoteBtn = document.getElementById('save-note-btn');

    // New UI Elements
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const createNoteContainer = document.getElementById('create-note-container');
    const createNoteExpanded = document.getElementById('create-note-expanded');
    const createNoteFooter = document.getElementById('create-note-footer');
    const closeNoteBtn = document.getElementById('close-note-btn');
    const searchInput = document.getElementById('search-input');

    // Modal UI Elements
    const noteModal = document.getElementById('note-modal');
    const noteModalContent = document.getElementById('note-modal-content');
    const noteModalBackdrop = document.getElementById('note-modal-backdrop');
    const modalNoteTitle = document.getElementById('modal-note-title');
    const modalNoteBody = document.getElementById('modal-note-body');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCopyBtn = document.getElementById('modal-copy-btn');
    const modalDeleteBtn = document.getElementById('modal-delete-btn');
    const modalMetadata = document.getElementById('modal-note-metadata');
    let currentModalNote = null;
    let allNotesData = [];

    // Search logic
    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (!query) {
            renderNotes(allNotesData);
            return;
        }
        
        const filtered = allNotesData.filter(note => {
            const titleMatch = (note.title || '').toLowerCase().includes(query);
            const textMatch = (note.text || '').toLowerCase().includes(query);
            return titleMatch || textMatch;
        });
        
        renderNotes(filtered);
    });

    function openModal(note) {
        currentModalNote = note;
        modalNoteTitle.textContent = note.title || '';
        modalNoteTitle.style.display = note.title ? 'block' : 'none';
        modalNoteBody.innerHTML = parseRichText(note.text || '');
        modalNoteBody.style.display = note.text ? 'block' : 'none';
        
        modalMetadata.innerHTML = '';
        if (note.timestamps) {
            if (note.timestamps.created) {
                const createdDate = new Date(note.timestamps.created).toLocaleString();
                const pCreate = document.createElement('div');
                pCreate.textContent = `Tạo: ${createdDate}`;
                modalMetadata.appendChild(pCreate);
            }
            if (note.timestamps.userEdited && note.timestamps.userEdited !== note.timestamps.created) {
                const editedDate = new Date(note.timestamps.userEdited).toLocaleString();
                const pEdit = document.createElement('div');
                pEdit.textContent = `Sửa: ${editedDate}`;
                modalMetadata.appendChild(pEdit);
            }
        }
        
        noteModal.classList.remove('hidden');
        // trigger reflow
        void noteModal.offsetWidth;
        
        noteModalContent.classList.remove('scale-95', 'opacity-0');
        noteModalContent.classList.add('scale-100', 'opacity-100');
    }

    function closeModal() {
        noteModalContent.classList.remove('scale-100', 'opacity-100');
        noteModalContent.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            noteModal.classList.add('hidden');
            currentModalNote = null;
        }, 300); // match transition duration
    }

    modalCloseBtn.addEventListener('click', closeModal);
    noteModalBackdrop.addEventListener('click', closeModal);

    modalCopyBtn.addEventListener('click', () => {
        if (!currentModalNote) return;
        const textToCopy = [currentModalNote.title, currentModalNote.text].filter(Boolean).join('\n\n');
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = modalCopyBtn.textContent;
            modalCopyBtn.textContent = 'Đã copy!';
            setTimeout(() => { modalCopyBtn.textContent = originalText; }, 2000);
        });
    });

    modalDeleteBtn.addEventListener('click', () => {
        if (!currentModalNote) return;
        if (confirm('Bạn có chắc chắn muốn xóa ghi chú này?')) {
            const originalText = modalDeleteBtn.textContent;
            modalDeleteBtn.textContent = 'Đang xoá...';
            modalDeleteBtn.disabled = true;
            
            chrome.runtime.sendMessage({ action: 'DELETE_NOTE', note: currentModalNote }, (response) => {
                modalDeleteBtn.textContent = originalText;
                modalDeleteBtn.disabled = false;
                if (response && response.success) {
                    closeModal();
                    loadData();
                } else {
                    alert('Lỗi xóa ghi chú: ' + (response?.error || 'Unknown error'));
                }
            });
        }
    });

    // Theme initialization
    let isDark = false;
    chrome.storage.local.get(['theme'], (result) => {
        if (result.theme) {
            isDark = result.theme === 'dark';
        } else {
            isDark = false; // Mặc định là sáng theo yêu cầu
        }
        if (isDark) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    });

    themeToggleBtn.addEventListener('click', () => {
        isDark = !isDark;
        if (isDark) {
            document.documentElement.classList.add('dark');
            chrome.storage.local.set({ theme: 'dark' });
        } else {
            document.documentElement.classList.remove('dark');
            chrome.storage.local.set({ theme: 'light' });
        }
    });

    // Expandable Note logic
    function expandNoteForm() {
        createNoteExpanded.classList.remove('hidden');
        createNoteExpanded.classList.add('flex');
        createNoteFooter.classList.remove('hidden');
        createNoteFooter.classList.add('flex');
        createNoteContainer.classList.add('ring-2', 'ring-yellow-400', 'dark:ring-yellow-500');
    }

    function collapseNoteForm() {
        createNoteExpanded.classList.add('hidden');
        createNoteExpanded.classList.remove('flex');
        createNoteFooter.classList.add('hidden');
        createNoteFooter.classList.remove('flex');
        createNoteContainer.classList.remove('ring-2', 'ring-yellow-400', 'dark:ring-yellow-500');
        noteTitleInput.value = '';
        noteBodyInput.value = '';
        noteBodyInput.style.height = 'auto'; // reset textarea height
    }

    noteBodyInput.addEventListener('focus', expandNoteForm);
    noteTitleInput.addEventListener('focus', expandNoteForm);
    
    closeNoteBtn.addEventListener('click', () => {
        if (noteTitleInput.value.trim() || noteBodyInput.value.trim()) {
            saveNoteBtn.click(); // Trigger save if there's text
        } else {
            collapseNoteForm();
        }
    });

    // Auto-resize textarea
    noteBodyInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    // Context Menu Setup
    const contextMenu = document.createElement('div');
    contextMenu.className = 'fixed hidden bg-white border border-slate-200 shadow-lg rounded-md py-1 z-50 min-w-[120px] text-sm';
    contextMenu.innerHTML = `
        <button id="ctx-copy" class="w-full text-left px-4 py-2 text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer">
            <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            Copy
        </button>
        <button id="ctx-delete" class="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer">
            <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            Xoá
        </button>
    `;
    document.body.appendChild(contextMenu);
    
    let activeNote = null;
    let activeCard = null;

    document.addEventListener('click', () => {
        contextMenu.classList.add('hidden');
    });

    document.getElementById('ctx-copy').addEventListener('click', () => {
        if (!activeNote) return;
        const textToCopy = [activeNote.title, activeNote.text].filter(Boolean).join('\n\n');
        navigator.clipboard.writeText(textToCopy);
    });

    document.getElementById('ctx-delete').addEventListener('click', () => {
        if (!activeNote || !activeCard) return;
        if (confirm('Bạn có chắc chắn muốn xóa ghi chú này?')) {
            activeCard.style.opacity = '0.5';
            chrome.runtime.sendMessage({ action: 'DELETE_NOTE', note: activeNote }, (response) => {
                if (response && response.success) {
                    loadData();
                } else {
                    activeCard.style.opacity = '1';
                    alert('Lỗi xóa ghi chú: ' + (response?.error || 'Unknown error'));
                }
            });
        }
    });


    loginBtn.addEventListener('click', () => {
        window.open('https://keep.google.com', '_blank');
    });

    refreshBtn.addEventListener('click', loadData);

    saveNoteBtn.addEventListener('click', async () => {
        const title = noteTitleInput.value.trim();
        const text = noteBodyInput.value.trim();
        if (!title && !text) return;
        
        const originalText = saveNoteBtn.textContent;
        saveNoteBtn.textContent = 'Đang lưu...';
        saveNoteBtn.disabled = true;

        chrome.runtime.sendMessage({ action: 'CREATE_NOTE', title, text }, (response) => {
            saveNoteBtn.textContent = originalText;
            saveNoteBtn.disabled = false;
            if (response && response.success) {
                collapseNoteForm();
                loadData();
            } else {
                let errorMsg = response?.error || 'Unknown error';
                if (response?.status) errorMsg += ` (Mã lỗi: ${response.status})`;
                if (response?.details) errorMsg += `\nChi tiết: ${response.details}`;
                alert('Lỗi tạo ghi chú: ' + errorMsg);
            }
        });
    });

    function showStatus(msg, showLogin = false) {
        statusContainer.classList.remove('hidden');
        statusContainer.classList.add('flex');
        contentContainer.classList.add('hidden');
        contentContainer.classList.remove('flex');
        statusMessage.textContent = msg;
        if (showLogin) {
            loginBtn.classList.remove('hidden');
        } else {
            loginBtn.classList.add('hidden');
        }
    }

    function showContent() {
        statusContainer.classList.add('hidden');
        statusContainer.classList.remove('flex');
        contentContainer.classList.remove('hidden');
        contentContainer.classList.add('flex');
    }

    function renderNotes(notes) {
        notesList.innerHTML = '';
        if (!notes || notes.length === 0) {
            notesList.innerHTML = '<p class="text-center text-slate-500 text-sm py-4">Không có ghi chú nào.</p>';
            return;
        }
        notes.forEach(note => {
            const card = document.createElement('div');
            card.className = 'break-inside-avoid border border-slate-200 dark:border-slate-700/50 rounded-xl p-3 shadow-sm bg-white/60 dark:bg-slate-800/60 backdrop-blur-sm hover:shadow-md transition-all duration-200 group relative';
            
            const contentDiv = document.createElement('div');
            contentDiv.className = 'cursor-pointer mb-2 pr-12';
            contentDiv.onclick = () => openModal(note);
            
            if (note.title) {
                const h3 = document.createElement('h3');
                h3.className = 'm-0 mb-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100 text-balance line-clamp-2';
                h3.textContent = note.title;
                contentDiv.appendChild(h3);
            }
            if (note.text) {
                const p = document.createElement('div');
                p.className = 'm-0 text-sm text-slate-700 dark:text-slate-300 text-pretty line-clamp-5';
                p.innerHTML = parseRichText(note.text);
                contentDiv.appendChild(p);
            }
            card.appendChild(contentDiv);
            
            // Actions container
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white/90 dark:bg-slate-800/90 shadow-sm border border-slate-100 dark:border-slate-700 rounded-md p-0.5';
            
            // Copy button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'p-1.5 text-slate-400 dark:text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer transition-colors duration-200';
            copyBtn.title = 'Copy';
            copyBtn.innerHTML = `
                <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                </svg>
            `;
            copyBtn.onclick = (e) => {
                e.stopPropagation();
                const textToCopy = [note.title, note.text].filter(Boolean).join('\n\n');
                navigator.clipboard.writeText(textToCopy).then(() => {
                    const originalSvg = copyBtn.innerHTML;
                    copyBtn.innerHTML = `
                        <svg class="size-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                        </svg>
                    `;
                    setTimeout(() => { copyBtn.innerHTML = originalSvg; }, 2000);
                });
            };
            
            // Delete button
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'p-1.5 text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded cursor-pointer transition-colors duration-200';
            deleteBtn.title = 'Xóa';
            deleteBtn.innerHTML = `
                <svg class="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
            `;
            deleteBtn.onclick = (e) => {
                e.stopPropagation();
                if (confirm('Bạn có chắc chắn muốn xóa ghi chú này?')) {
                    card.style.opacity = '0.5';
                    chrome.runtime.sendMessage({ action: 'DELETE_NOTE', note: note }, (response) => {
                        if (response && response.success) {
                            loadData();
                        } else {
                            card.style.opacity = '1';
                            alert('Lỗi xóa ghi chú: ' + (response?.error || 'Unknown error'));
                        }
                    });
                }
            };

            actionsDiv.appendChild(copyBtn);
            actionsDiv.appendChild(deleteBtn);
            card.appendChild(actionsDiv);
            
            // Context Menu trigger
            card.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                activeNote = note;
                activeCard = card;
                
                // Adjust position to stay within window
                let x = e.clientX;
                let y = e.clientY;
                contextMenu.style.left = `${x}px`;
                contextMenu.style.top = `${y}px`;
                contextMenu.classList.remove('hidden');
                
                const rect = contextMenu.getBoundingClientRect();
                if (rect.right > window.innerWidth) x -= rect.width;
                if (rect.bottom > window.innerHeight) y -= rect.height;
                
                contextMenu.style.left = `${x}px`;
                contextMenu.style.top = `${y}px`;
            });

            notesList.appendChild(card);
        });
    }

    function loadData() {
        showStatus('Đang tải dữ liệu...');
        chrome.runtime.sendMessage({ action: 'FETCH_KEEP_DATA' }, (response) => {
            if (chrome.runtime.lastError) {
                showStatus('Lỗi: ' + chrome.runtime.lastError.message);
                return;
            }
            
            if (response && response.success) {
                showContent();
                
                if (response.email && response.email !== 'Đã đăng nhập') {
                    userProfile.classList.remove('hidden');
                    userProfile.classList.add('flex');
                    const data = response.data || response;
                
                    // Update avatar
                    const initialSpan = document.getElementById('user-initial');
                    const avatarImg = document.getElementById('user-avatar');
                    const userEmailSpan = document.getElementById('user-email');
                    
                    userEmailSpan.textContent = data.email;
                    
                    if (data.avatarUrl) {
                        avatarImg.src = data.avatarUrl;
                        avatarImg.classList.remove('hidden');
                        initialSpan.classList.add('hidden');
                    } else if (data.email) {
                        initialSpan.textContent = data.email.charAt(0).toUpperCase();
                        avatarImg.classList.add('hidden');
                        initialSpan.classList.remove('hidden');
                    }
                    
                    const notes = data.notes || response.notes || [];
                    allNotesData = notes;
                    
                    const query = searchInput.value.toLowerCase().trim();
                    if (query) {
                        searchInput.dispatchEvent(new Event('input'));
                    } else {
                        renderNotes(notes);
                    }
                } else {
                    userProfile.classList.add('hidden');
                    userProfile.classList.remove('flex');
                    renderNotes([]);
                }
            } else if (response && response.error === 'NOT_LOGGED_IN') {
                showStatus('Vui lòng đăng nhập Google Keep để tiếp tục.', true);
            } else {
                let errorMsg = response?.error || 'Unknown';
                if (response?.status) {
                    errorMsg += ` (Mã lỗi: ${response.status})`;
                }
                if (response?.details) {
                    errorMsg += ` - Chi tiết: ${response.details}`;
                }
                showStatus('Lỗi tải dữ liệu: ' + errorMsg);
            }
        });
    }

    // Initial load
    loadData();
});
