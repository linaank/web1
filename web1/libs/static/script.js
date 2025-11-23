function showMessage(msg) {
    const el = document.getElementById('message');
    if (el) el.textContent = msg || ' ';
}

function bindSingleSelectCheckboxes(groupName) {
    const boxes = Array.from(document.querySelectorAll(`input[name="${groupName}"]`));
    boxes.forEach(box => {
        box.addEventListener('change', () => {
            if (box.checked) boxes.forEach(o => { if (o !== box) o.checked = false; });
        });
    });
}

function getCurrentR() {
    const rInput = document.getElementById('r');
    if (!rInput) return 2;
    const value = Number(String(rInput.value).replace(',', '.'));
    return (value >= 2 && value <= 5) ? value : 2;
}

function drawGraph() {
    const canvas = document.getElementById('graph');
    if (!canvas) return;
    
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth, cssH = canvas.clientHeight;
    if (canvas.width !== cssW * dpr || canvas.height !== cssH * dpr) {
        canvas.width = cssW * dpr; 
        canvas.height = cssH * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const W = cssW, H = cssH;
    const cx = Math.round(W/2), cy = Math.round(H/2);

    const pad = 26;
    const scaleX = (W/2 - pad) / 5;
    const scaleY = (H/2 - pad) / 5;
    const X = x => cx + x*scaleX;
    const Y = y => cy - y*scaleY;

    const r = getCurrentR();

    ctx.fillStyle = '#4EA3FF';

    ctx.beginPath();
    ctx.rect(X(0), Y(0), X(r/2) - X(0), Y(-r) - Y(0));
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    const R2 = Math.abs(r) / 2;
    ctx.ellipse(
        X(0), Y(0),
        R2 * scaleX, R2 * scaleY,
        0,
        1.5 * Math.PI,
        Math.PI,
        false
    );
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    const R = Math.abs(r);
    ctx.moveTo(X(0), Y(0));
    ctx.lineTo(X(0), Y(R));
    ctx.lineTo(X(R), Y(0));
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#000'; 
    ctx.lineWidth = 1.2;

    ctx.beginPath(); 
    ctx.moveTo(pad/2, cy); 
    ctx.lineTo(W-pad/2, cy); 
    ctx.stroke();
    ctx.beginPath(); 
    ctx.moveTo(W-pad/2, cy); 
    ctx.lineTo(W-pad/2-8, cy-4); 
    ctx.lineTo(W-pad/2-8, cy+4); 
    ctx.closePath(); 
    ctx.fillStyle='#000'; 
    ctx.fill();

    // Ось Y
    ctx.beginPath(); 
    ctx.moveTo(cx, H-pad/2); 
    ctx.lineTo(cx, pad/2); 
    ctx.stroke();
    ctx.beginPath(); 
    ctx.moveTo(cx, pad/2); 
    ctx.lineTo(cx-4, pad/2+8); 
    ctx.lineTo(cx+4, pad/2+8); 
    ctx.closePath(); 
    ctx.fill();

    ctx.fillStyle='#000'; 
    ctx.font='12px sans-serif'; 
    ctx.textAlign='center'; 
    ctx.textBaseline='top';
    
    function tickX(xVal, label){ 
        const x = X(xVal); 
        ctx.beginPath(); 
        ctx.moveTo(x, cy-4); 
        ctx.lineTo(x, cy+4); 
        ctx.stroke(); 
        ctx.fillText(label, x, cy+6); 
    }
    
    function tickY(yVal, label){ 
        const y = Y(yVal); 
        ctx.beginPath(); 
        ctx.moveTo(cx-4, y); 
        ctx.lineTo(cx+4, y); 
        ctx.stroke();
        ctx.textAlign='left'; 
        ctx.textBaseline='middle'; 
        ctx.fillText(label, cx+6, y-1); 
        ctx.textAlign='center'; 
        ctx.textBaseline='top'; 
    }
    
    ctx.fillText('x', W-26, cy+8); 
    ctx.save(); 
    ctx.translate(cx+12, 26); 
    ctx.rotate(-Math.PI/2); 
    ctx.fillText('y',0,0); 
    ctx.restore();

    tickX(-r, '−R'); 
    tickX(-r/2, '−R/2'); 
    tickX(r/2, 'R/2'); 
    tickX(r, 'R');
    tickY(r, 'R'); 
    tickY(r/2, 'R/2');  
    tickY(-r/2, '−R/2'); 
    tickY(-r, '−R');
}

function sendData(x, y, r) {
    const params = new URLSearchParams({ 
        x: String(x), 
        y: String(y), 
        r: String(r) 
    });
    fetch('/fcgi-bin/server.jar', {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/x-www-form-urlencoded', 
            'Accept': 'text/html' 
        },
        body: params.toString(),
        cache: 'no-store',
        credentials: 'include'
    })
        .then(res => { 
            if (!res.ok) throw new Error('Сетевая ошибка: ' + res.status); 
            return res.text(); 
        })
        .then(html => updateTable(html))
        .catch(err => showMessage('Ошибка: ' + String(err)));
}

function updateTable(htmlRow) {
    const results = document.getElementById('results');
    const tmp = document.createElement('tbody');
    tmp.innerHTML = (htmlRow || '').trim();
    const newRow = tmp.firstChild;
    if (newRow) results.insertBefore(newRow, results.firstChild);
}

function loadHistory() {
    fetch('/fcgi-bin/server.jar?action=history', { 
        method:'GET', 
        cache:'no-store', 
        credentials:'include' 
    })
        .then(r => r.text())
        .then(html => { 
            document.getElementById('results').innerHTML = html || ''; 
        })
        .catch(() => {});
}

function clearResults() {
    fetch('/fcgi-bin/server.jar?action=clear', { 
        method:'GET', 
        cache:'no-store', 
        credentials:'include' 
    })
        .then(() => { 
            document.getElementById('results').innerHTML=''; 
            showMessage('Таблица очищена.'); 
        })
        .catch(() => { 
            document.getElementById('results').innerHTML=''; 
        });
}

function validateForm(e) {
    e.preventDefault(); 
    showMessage('');
    const yInput = document.getElementById('y'); 
    const rInput = document.getElementById('r');
    yInput.dataset.invalid = 'false';
    rInput.dataset.invalid = 'false';

    const xChecked = Array.from(document.querySelectorAll('input[name="x"]:checked'));
    if (xChecked.length !== 1) { 
        showMessage('Выберите ровно одно значение X.'); 
        return false; 
    }
    const x = Number(String(xChecked[0].value).replace(',', '.'));

    const yRaw = yInput.value.trim().replace(',', '.');
    const y = Number(yRaw);
    const yValid = yRaw !== '' && !Number.isNaN(y) && y >= -3 && y <= 3;
    if (!yValid) { 
        showMessage('Y должен быть числом от -3 до 3.'); 
        yInput.dataset.invalid = 'true'; 
        return false; 
    }

    const rRaw = rInput.value.trim().replace(',', '.');
    const r = Number(rRaw);
    const rValid = rRaw !== '' && !Number.isNaN(r) && r >= 2 && r <= 5;
    if (!rValid) { 
        showMessage('R должен быть числом от 2 до 5.'); 
        rInput.dataset.invalid = 'true'; 
        return false; 
    }

    sendData(x, y, r);
    return false;
}

document.addEventListener('DOMContentLoaded', () => {
    bindSingleSelectCheckboxes('x');
    
    drawGraph();
    
    const rInput = document.getElementById('r');
    rInput.addEventListener('input', () => {
        const v = rInput.value.replace(',', '.');
        if (!/^[-+]?\d*\.?\d*$/.test(v)) {
            rInput.value = v.slice(0, -1); 
        } else {
            rInput.value = v;
        }
        
        rInput.dataset.invalid = 'false';
        
        drawGraph();
    });
    
    window.addEventListener('resize', drawGraph);
    
    document.getElementById('pk').addEventListener('submit', validateForm);
    document.getElementById('clearTableBtn').addEventListener('click', clearResults);

    const yInput = document.getElementById('y');
    yInput.addEventListener('input', () => {
        const v = yInput.value.replace(',', '.');
        if (!/^[-+]?\d*\.?\d*$/.test(v)) {
            yInput.value = v.slice(0, -1); 
        } else {
            yInput.value = v;
        }

        yInput.dataset.invalid = 'false';
    });

    loadHistory();
});
