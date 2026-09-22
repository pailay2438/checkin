const checkinState = {
    profileReady: false,
    hasLocation: false,
    submitting: false,
    receipt: null,
    lineSent: {},
    requestIds: {}
};

$(document).ready(function () {
    showhidepage('header');
    updateCheckinButton_();
    initializeLiff_();
    initializeLocation_();
});

async function initializeLiff_() {
    try {
        await liff.init({ liffId: '2007625542-wQkKVGv7' });
        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }
        const profile = await liff.getProfile();
        $('#home').data('imguser', profile.pictureUrl || '');
        $('#home').data('uuid', profile.userId);
        if (profile.pictureUrl) $('.imgpro').attr('src', profile.pictureUrl);
        await checkuser(profile.userId);
    } catch (error) {
        console.error('LIFF initialization failed', error);
        await Swal.fire({
            icon: 'error',
            title: 'เปิดระบบ LINE ไม่สำเร็จ',
            text: 'กรุณาปิดหน้านี้แล้วเปิดจากริชเมนูอีกครั้ง',
            allowOutsideClick: false,
            confirmButtonText: 'ตกลง'
        });
    }
}

function initializeLocation_() {
    if (!navigator.geolocation) {
        Swal.fire({
            icon: 'error',
            title: 'อุปกรณ์ไม่รองรับตำแหน่งที่ตั้ง',
            confirmButtonText: 'ตกลง'
        });
        return;
    }

    const map = L.map('map').setView([0, 0], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);
    const marker = L.marker([0, 0]).addTo(map);

    navigator.geolocation.watchPosition(
        pos => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            $('#lat').val(lat.toFixed(6));
            $('#lng').val(lng.toFixed(6));
            marker.setLatLng([lat, lng]);
            map.setView([lat, lng]);
            checkinState.hasLocation = true;
            updateCheckinButton_();
        },
        error => {
            console.warn('Geolocation error:', error);
            checkinState.hasLocation = false;
            updateCheckinButton_();
            Swal.fire({
                icon: 'warning',
                title: 'ยังไม่ได้รับตำแหน่งที่ตั้ง',
                text: 'กรุณาอนุญาตให้ LINE ใช้ตำแหน่ง แล้วเปิดหน้านี้ใหม่',
                confirmButtonText: 'ตกลง'
            });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
    );

    new ResizeObserver(() => map.invalidateSize())
        .observe(document.querySelector('.ratio'));
}

async function checkuser(uuid) {
    showhidepage('header');
    try {
        const res = await callApiWithTimeout_('checkuser', { uuid }, 15000);
        if (res.status !== 'success') {
            await Swal.fire({
                icon: 'error',
                title: res.message,
                text: res.text,
                allowOutsideClick: false,
                confirmButtonText: 'ตกลง'
            });
            return;
        }
        $('#name').val(res.name);
        $('#rank').val(res.rank);
        checkinState.profileReady = true;
        showhidepage('.home');
        updateCheckinButton_();
    } catch (error) {
        console.error(error);
        await Swal.fire({
            icon: 'error',
            title: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
            text: 'กรุณาปิดแล้วเปิดหน้าเช็กอินอีกครั้ง',
            allowOutsideClick: false,
            confirmButtonText: 'ตกลง'
        });
    }
}

$('.checkin').click(async function (event) {
    event.preventDefault();
    if (checkinState.submitting) return;
    checkinState.submitting = true;
    updateCheckinButton_();
    try {
        if (checkinState.receipt) {
            await finishConfirmation_(checkinState.receipt);
            return;
        }
        const itemData = await getFormData('home');
        // Always use the approved employee name, never a stale generic localStorage name.
        itemData.name = $('#name').val();
        if (!checkvalue(itemData, ['comment', 'imguser'])) return;
        itemData.request_id = getRequestId_(itemData.uuid);
        showhidepage('header');
        const res = await callApiWithTimeout_('savecheckin', itemData, 20000);
        if (res.status !== 'success') {
            showhidepage('.home');
            await Swal.fire({
                icon: 'error',
                title: res.message,
                text: res.text,
                allowOutsideClick: false,
                confirmButtonText: 'ตกลง'
            });
            return;
        }

        checkinState.receipt = { ...res, imageUrl: res.imageUrl === undefined ? itemData.imguser : res.imageUrl,
            receiptId: res.receiptId || itemData.request_id };
        await finishConfirmation_(checkinState.receipt);
    } catch (error) {
        console.error(error);
        showhidepage('.home');
        if (checkinState.receipt) {
            await Swal.fire({icon:'warning',title:'บันทึกเข้างานเรียบร้อยแล้ว',
                text:'แต่ยังส่งยืนยันกลับ LINE ไม่สำเร็จ กดปุ่มส่งยืนยันอีกครั้งได้โดยไม่บันทึกซ้ำ',confirmButtonText:'ตกลง'});
            return;
        }
        await Swal.fire({
            icon: 'warning',
            title: 'ยังยืนยันผลการบันทึกไม่ได้',
            text: 'ลองกดบันทึกอีกครั้งได้ ระบบจะตรวจรายการเดิมและไม่เพิ่มข้อมูลซ้ำ',
            allowOutsideClick: false,
            confirmButtonText: 'ตกลง'
        });
    } finally {
        checkinState.submitting = false;
        updateCheckinButton_();
    }
});

async function finishConfirmation_(receipt) {
    if (!liff.isInClient()) {
        showhidepage('.home');
        await Swal.fire({icon:'success',title:'บันทึกเข้างานเรียบร้อยแล้ว',
            text:'หากต้องการส่งยืนยันในแชต กรุณาเปิดผ่านเมนูใน LINE',confirmButtonText:'ตกลง'});
        return;
    }
    const key = 'checkin_line_' + receipt.receiptId;
    let sent = checkinState.lineSent[key] || {};
    try { sent = { ...JSON.parse(localStorage.getItem(key) || '{}'), ...sent }; } catch (_) {}
    const remember = () => {
        checkinState.lineSent[key] = sent;
        try { localStorage.setItem(key, JSON.stringify(sent)); } catch (_) {}
    };
    // Track text and image separately, so a failed image does not replay confirmed text.
    if (!sent.text) {
        await liff.sendMessages([{type:'text',text:receipt.msg}]);
        sent.text = true; remember();
    }
    if (receipt.imageUrl && !sent.image) {
        await liff.sendMessages([{type:'image',originalContentUrl:receipt.imageUrl,previewImageUrl:receipt.imageUrl}]);
        sent.image = true; remember();
    }
    await Swal.fire({icon:'success',title:'บันทึกและส่งยืนยันเรียบร้อยแล้ว',timer:1000,showConfirmButton:false});
    liff.closeWindow();
}

function updateCheckinButton_() {
    const disabled = !checkinState.profileReady || (!checkinState.receipt && !checkinState.hasLocation) || checkinState.submitting;
    $('.checkin')
        .prop('disabled', disabled)
        .text(checkinState.submitting ? 'กำลังดำเนินการ...' : checkinState.receipt ? 'ส่งยืนยัน LINE อีกครั้ง' : 'บันทึกเข้างาน');
}

function requestStorageKey_(uuid) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
    return 'checkin_request_' + uuid + '_' + today;
}

function getRequestId_(uuid) {
    const key = requestStorageKey_(uuid);
    let requestId = checkinState.requestIds[key];
    try { requestId = requestId || sessionStorage.getItem(key); } catch (_) {}
    if (!requestId) {
        requestId = window.crypto && window.crypto.randomUUID
            ? window.crypto.randomUUID()
            : Date.now() + '-' + Math.random().toString(36).slice(2);
        try { sessionStorage.setItem(key, requestId); } catch (_) {}
    }
    checkinState.requestIds[key] = requestId;
    return requestId;
}

async function callApiWithTimeout_(opt, itemData, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const payload = { opt, ...itemData };
        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: new URLSearchParams(payload),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: controller.signal
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        return await response.json();
    } finally {
        clearTimeout(timer);
    }
}
