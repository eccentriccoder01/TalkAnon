const socket = io("https://talkanon.onrender.com", {
  transports: ["websocket"],
  upgrade: false
});
class ChatApp {
    constructor() {
        this.currentUser = null;
        this.currentRoom = null;
        this.rooms = new Map();
        this.users = new Map();
        this.messages = new Map();
        this.typingUsers = new Set();
        this.settings = {
            notificationSound: true,
            darkMode: false,
            showTimestamps: true
        };
        this.connectionStatus = 'disconnected';
        this.typingTimeout = null;
        this.messageId = 0;
        
        this.initializeApp();
        this.setupEventListeners();
        this.loadSettings();

        socket.on("receive-message", (msg) => {
            if (!msg || !msg.room) return;

            // Check if message already exists to prevent duplicates
            const roomMessages = this.messages.get(msg.room) || [];
            const messageExists = roomMessages.some(existingMsg => 
                existingMsg.id === msg.id || 
                (existingMsg.username === msg.username && 
                existingMsg.text === msg.text && 
                Math.abs(new Date(existingMsg.timestamp) - new Date(msg.timestamp)) < 1000)
            );

            if (messageExists) return;

            if (!this.messages.has(msg.room)) {
                this.messages.set(msg.room, []);
            }

            // Add formatted text to the message
            msg.formattedText = this.formatMessage(msg.text);

            this.messages.get(msg.room).push(msg);

            // Only render if the message belongs to the currently active room
            if (msg.room === this.currentRoom) {
                this.renderMessage(msg);
                this.scrollToBottom();

                // Play notification sound if enabled (for messages from other users)
                if (this.settings.notificationSound && this.currentUser && msg.username !== this.currentUser.username) {
                    this.playNotificationSound();
                }
            }
        });

        socket.on("message-history", (messages) => {
        this.messages.set(this.currentRoom, messages.map(msg => ({
            ...msg,
            formattedText: this.formatMessage(msg.text)
        })));
        this.renderMessages();
        });

        socket.on("user-list", (userList) => {
            this.users = new Map();

            userList.forEach((user, index) => {
                const generatedId = this.generateId();  // optional, or just use username as key
                this.users.set(generatedId, {
                    id: generatedId,
                    username: user.username,
                    status: 'online'
                });
            });

            this.renderUsers();
        });

        socket.on("new-room", (room) => {
        this.rooms.set(room.id, {
            ...room,
            users: new Set(),
            messages: [],
            created: new Date()
        });
        this.messages.set(room.id, []);
        this.renderRooms();
        });

        socket.on("connect_error", (err) => {
        console.log("Connection error:", err);
        this.showNotification('Connection error. Trying to reconnect...', 'error');
        });

        socket.on("reconnect", () => {
        console.log("Reconnected to server");
        this.showNotification('Reconnected to server', 'success');
        });
    }

    initializeApp() {
        // Initialize default rooms
        this.rooms.set('general', {
            id: 'general',
            name: 'General',
            description: 'General discussion',
            users: new Set(),
            messages: [],
            created: new Date()
        });

        this.rooms.set('random', {
            id: 'random',
            name: 'Random',
            description: 'Random conversations',
            users: new Set(),
            messages: [],
            created: new Date()
        });

        this.rooms.set('tech', {
            id: 'tech',
            name: 'Tech Talk',
            description: 'Technology discussions',
            users: new Set(),
            messages: [],
            created: new Date()
        });

        // Initialize messages storage
        this.rooms.forEach((room, roomId) => {
            this.messages.set(roomId, []);
        });

        this.renderRooms();
        this.simulateConnection();
    }

    setupEventListeners() {
        // Login form
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Create room form
        document.getElementById('createRoomForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateRoom();
        });

        // Message form
        document.getElementById('messageForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSendMessage();
        });

        // Message input typing
        document.getElementById('messageInput').addEventListener('input', () => {
            this.handleTyping();
        });

        // Room creation button
        document.getElementById('createRoomBtn').addEventListener('click', () => {
            this.openModal('createRoomModal');
        });

        // Settings button
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openModal('settingsModal');
        });

        // Logout button
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.handleLogout();
        });

        // Emoji picker
        document.getElementById('emojiBtn').addEventListener('click', () => {
            this.toggleEmojiPicker();
        });

        // Emoji selection
        document.querySelectorAll('.emoji').forEach(emoji => {
            emoji.addEventListener('click', () => {
                this.insertEmoji(emoji.dataset.emoji);
            });
        });

        // Settings toggles
        document.getElementById('notificationSound').addEventListener('change', (e) => {
            this.settings.notificationSound = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('darkMode').addEventListener('change', (e) => {
            this.settings.darkMode = e.target.checked;
            this.toggleDarkMode();
            this.saveSettings();
        });

        document.getElementById('showTimestamps').addEventListener('change', (e) => {
            this.settings.showTimestamps = e.target.checked;
            this.saveSettings();
        });

        // Sidebar toggle for mobile
        document.getElementById('toggleSidebar').addEventListener('click', () => {
            document.querySelector('.sidebar').classList.toggle('open');
        });

        // Close sidebar when clicking outside on mobile
        document.addEventListener('click', (e) => {
            const sidebar = document.querySelector('.sidebar');
            const toggleBtn = document.getElementById('toggleSidebar');
            
            if (window.innerWidth <= 768 && 
                !sidebar.contains(e.target) && 
                !toggleBtn.contains(e.target)) {
                sidebar.classList.remove('open');
            }
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeAllModals();
                this.hideEmojiPicker();
            }
        });

        // Auto-scroll to bottom when new messages arrive
        window.addEventListener('resize', () => {
            this.scrollToBottom();
        });
    }

    handleLogin() {
        const username = document.getElementById('usernameInput').value.trim();
        socket.emit("login", username);
        if (!username) {
            this.showNotification('Please enter a username', 'error');
            return;
        }

        if (this.isUsernameTaken(username)) {
            this.showNotification('Username is already taken', 'error');
            return;
        }

        this.currentUser = {
            id: this.generateId(),
            username: username,
            avatar: username.charAt(0).toUpperCase(),
            status: 'online',
            joinedAt: new Date()
        };

        // this.users.set(this.currentUser.id, this.currentUser);
        
        document.getElementById('loginModal').classList.add('hidden');
        document.getElementById('chatContainer').classList.remove('hidden');
        document.getElementById('currentUsername').textContent = username;
        
        this.connectionStatus = 'connected';
        this.updateConnectionStatus();
        this.renderUsers();
        this.showNotification(`Welcome, ${username}!`, 'success');
        
        // Auto-join general room
        this.joinRoom('general');
    }

    handleCreateRoom() {
        const roomName = document.getElementById('roomNameInput').value.trim();
        const roomDesc = document.getElementById('roomDescInput').value.trim();
        
        if (!roomName) {
            this.showNotification('Please enter a room name', 'error');
            return;
        }

        if (this.isRoomNameTaken(roomName)) {
            this.showNotification('Room name is already taken', 'error');
            return;
        }

        const roomId = this.generateId();
        const room = {
            id: roomId,
            name: roomName,
            description: roomDesc || 'No description',
            users: new Set(),
            messages: [],
            created: new Date(),
            creator: this.currentUser.id
        };

        this.rooms.set(roomId, room);
        this.messages.set(roomId, []);
        this.renderRooms();
        this.closeModal('createRoomModal');
        this.showNotification(`Room "${roomName}" created successfully!`, 'success');
        
        // Auto-join the created room
        this.joinRoom(roomId);
        
        // Clear form
        document.getElementById('roomNameInput').value = '';
        document.getElementById('roomDescInput').value = '';

        socket.emit("create-room", {
        id: roomId,
        name: roomName,
        description: roomDesc || "No description"
        });
    }

    handleSendMessage() {
        const messageInput = document.getElementById('messageInput');
        const messageText = messageInput.value.trim();

        if (!messageText || !this.currentRoom || !this.currentUser) return;

        // Simply emit the message to server - don't store locally
        socket.emit("send-message", {
            text: messageText,
            room: this.currentRoom
        });

        // Clear the input and typing indicator
        messageInput.value = '';
        this.clearTyping();
    }

    handleTyping() {
        if (!this.currentRoom) return;
        
        clearTimeout(this.typingTimeout);
        
        this.typingTimeout = setTimeout(() => {
            this.clearTyping();
        }, 1000);
        
        this.showTyping();
    }

    handleLogout() {
        if (this.currentUser) {
            this.users.delete(this.currentUser.id);
            this.rooms.forEach(room => {
                room.users.delete(this.currentUser.id);
            });
        }
        
        this.currentUser = null;
        this.currentRoom = null;
        this.connectionStatus = 'disconnected';
        
        document.getElementById('chatContainer').classList.add('hidden');
        document.getElementById('loginModal').classList.remove('hidden');
        document.getElementById('usernameInput').value = '';
        
        this.updateConnectionStatus();
        this.renderUsers();
        this.showNotification('You have been logged out', 'warning');
    }

    joinRoom(roomId) {
        if (!this.rooms.has(roomId)) return;
        
        if (this.currentRoom) {
            this.rooms.get(this.currentRoom).users.delete(this.currentUser.id);
        }
        this.currentRoom = roomId;
        const room = this.rooms.get(roomId);
        room.users.add(this.currentUser.id);
        socket.emit("join-room", roomId);
        this.updateRoomSelection();
        document.getElementById('messagesArea').innerHTML = '';
        this.renderMessages();
        this.updateRoomHeader();
        this.renderUsers();
        this.addSystemMessage(`${this.currentUser.username} joined the room`);
        document.getElementById('messageInput').focus();
    }

    formatMessage(text) {
        text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
        text = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
        text = text.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        text = text.replace(/```(.*?)```/gs, '<div class="code-block"><pre>$1</pre></div>');
        text = text.replace(/`(.*?)`/g, '<code>$1</code>');
        return text;
    }

    playNotificationSound() {
    const audio = new Audio('https://assets.mixkit.co/sfx/preview/mixkit-positive-interface-beep-221.mp3');
    audio.volume = 0.3;
    audio.play().catch(e => console.log("Audio play failed:", e));
    }

    renderRooms() {
        const roomsList = document.getElementById('roomsList');
        roomsList.innerHTML = '';
        
        this.rooms.forEach((room, roomId) => {
            const roomElement = document.createElement('div');
            roomElement.className = 'room-item';
            roomElement.dataset.roomId = roomId;
            
            if (roomId === this.currentRoom) {
                roomElement.classList.add('active');
            }
            
            roomElement.innerHTML = `
                <div class="room-icon">
                    <i class="fas fa-hashtag"></i>
                </div>
                <div class="room-info">
                    <h4>${room.name}</h4>
                    <p>${room.description}</p>
                </div>
                <div class="room-users">${room.users.size}</div>
            `;
            
            roomElement.addEventListener('click', () => {
                this.joinRoom(roomId);
            });
            
            roomsList.appendChild(roomElement);
        });
    }

    renderUsers() {
        const usersList = document.getElementById('usersList');
        const userCount = document.getElementById('userCount');
        
        usersList.innerHTML = '';
        userCount.textContent = this.users.size;
        
        this.users.forEach(user => {
            const userElement = document.createElement('div');
            userElement.className = 'user-item';
            
            userElement.innerHTML = `
                <div class="user-status ${user.status}"></div>
                <span>${user.username}</span>
            `;
            
            usersList.appendChild(userElement);
        });
    }

    renderMessages() {
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.innerHTML = '';
        
        if (!this.currentRoom) {
            messagesArea.innerHTML = `
                <div class="welcome-message">
                    <i class="fas fa-comments"></i>
                    <h3>Welcome to TalkAnon</h3>
                    <p>Select a room to start chatting or create a new one!</p>
                </div>
            `;
            return;
        }
        
        const messages = this.messages.get(this.currentRoom) || [];
        
        messages.forEach(message => {
            this.renderMessage(message);
        });
        
        this.scrollToBottom();
    }

    renderMessage(message) {
        const messagesArea = document.getElementById('messagesArea');
        const messageElement = document.createElement('div');
        messageElement.className = 'message';

        // Compare usernames for 'own' class
        if (this.currentUser && message.username === this.currentUser.username) {
            messageElement.classList.add('own');
        }

        const avatar = message.username.charAt(0).toUpperCase();
        const timestampHtml = this.settings.showTimestamps ? `<span class="timestamp">${this.formatTime(new Date(message.timestamp))}</span>` : '';

        messageElement.innerHTML = `
            <div class="message-header">
                <div class="avatar">${avatar}</div>
                <span class="username">${message.username}</span>
                ${timestampHtml}
            </div>
            <div class="message-content">
                ${message.formattedText || message.text}
            </div>
        `;
        messagesArea.appendChild(messageElement);
    }

    addSystemMessage(text) {
        const message = {
            id: ++this.messageId,
            text: text,
            type: 'system',
            roomId: this.currentRoom,
            timestamp: new Date()
        };
        
        this.messages.get(this.currentRoom).push(message);
        this.renderMessage(message);
        this.scrollToBottom();
    }

    updateRoomSelection() {
        document.querySelectorAll('.room-item').forEach(item => {
            item.classList.remove('active');
        });
        
        const activeRoom = document.querySelector(`[data-room-id="${this.currentRoom}"]`);
        if (activeRoom) {
            activeRoom.classList.add('active');
        }
    }

    updateRoomHeader() {
        const room = this.rooms.get(this.currentRoom);
        if (room) {
            document.getElementById('currentRoomName').textContent = room.name;
            document.getElementById('roomUserCount').textContent = `${room.users.size} users`;
        }
    }

    showTyping() {
        const typingIndicator = document.getElementById('typingIndicator');
        typingIndicator.innerHTML = `
            <span class="typing-dots">${this.currentUser.username} is typing...</span>
        `;
    }

    clearTyping() {
        const typingIndicator = document.getElementById('typingIndicator');
        typingIndicator.innerHTML = '';
    }

    toggleEmojiPicker() {
        const emojiPicker = document.getElementById('emojiPicker');
        emojiPicker.classList.toggle('hidden');
    }

    hideEmojiPicker() {
        const emojiPicker = document.getElementById('emojiPicker');
        emojiPicker.classList.add('hidden');
    }

    insertEmoji(emoji) {
        const messageInput = document.getElementById('messageInput');
        const cursorPos = messageInput.selectionStart;
        const text = messageInput.value;
        
        messageInput.value = text.slice(0, cursorPos) + emoji + text.slice(cursorPos);
        messageInput.focus();
        messageInput.setSelectionRange(cursorPos + emoji.length, cursorPos + emoji.length);
        
        this.hideEmojiPicker();
    }

    openModal(modalId) {
        document.getElementById(modalId).classList.remove('hidden');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.add('hidden');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    showNotification(message, type = 'info') {
        const container = document.getElementById('notificationContainer');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        
        const iconMap = {
            success: 'fas fa-check-circle',
            error: 'fas fa-exclamation-circle',
            warning: 'fas fa-exclamation-triangle',
            info: 'fas fa-info-circle'
        };
        
        notification.innerHTML = `
            <div class="notification-header">
                <i class="${iconMap[type]}"></i>
                <span>${type.charAt(0).toUpperCase() + type.slice(1)}</span>
            </div>
            <div class="notification-body">${message}</div>
        `;
        
        container.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            notification.remove();
        }, 5000);
    }

    scrollToBottom() {
        const messagesArea = document.getElementById('messagesArea');
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    formatTime(date) {
        return date.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });
    }

    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    isUsernameTaken(username) {
        return Array.from(this.users.values()).some(user => 
            user.username.toLowerCase() === username.toLowerCase()
        );
    }

    isRoomNameTaken(roomName) {
        return Array.from(this.rooms.values()).some(room => 
            room.name.toLowerCase() === roomName.toLowerCase()
        );
    }

    toggleDarkMode() {
        if (this.settings.darkMode) {
            document.body.setAttribute('data-theme', 'dark');
        } else {
            document.body.removeAttribute('data-theme');
        }
    }

    loadSettings() {
        const savedSettings = localStorage.getItem('chatapp-settings');
        if (savedSettings) {
            this.settings = { ...this.settings, ...JSON.parse(savedSettings) };
        }
        
        // Apply settings to UI
        document.getElementById('notificationSound').checked = this.settings.notificationSound;
        document.getElementById('darkMode').checked = this.settings.darkMode;
        document.getElementById('showTimestamps').checked = this.settings.showTimestamps;

        // Apply dark mode if enabled
        this.toggleDarkMode();
    }

    saveSettings() {
        localStorage.setItem('chatapp-settings', JSON.stringify(this.settings));
    }

    simulateConnection() {
        const statusEl = document.createElement('div');
        statusEl.className = 'connection-status';
        statusEl.id = 'connectionStatus';
        statusEl.textContent = 'Connecting...';
        document.body.appendChild(statusEl);

        setTimeout(() => {
            this.connectionStatus = 'connected';
            this.updateConnectionStatus();
        }, 1000);
    }

updateConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    if (!statusEl) return;

    if (this.connectionStatus === 'connected') {
        statusEl.classList.add('connected');
        statusEl.textContent = 'Connected';

        // Hide it after 2s
        setTimeout(() => {
            statusEl.remove();
        }, 2000);
    } else {
        statusEl.classList.remove('connected');
        statusEl.textContent = 'Disconnected';
    }
}
}

window.addEventListener('DOMContentLoaded', () => {
    appInstance = new ChatApp();
})
let appInstance;
window.closeModal = function(modalId) {
    appInstance?.closeModal(modalId);
};
