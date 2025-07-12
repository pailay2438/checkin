$(document).ready(function () {
    showhidepage('header');
    initializeLiff()
    async function initializeLiff() {
        try {
            await liff.init({ liffId: "2007625542-wQkKVGv7" })
            if (liff.isLoggedIn()) {
                getUserProfile()
            } else {
                liff.login()
            }
        } catch (error) {
            console.error('LIFF Initialization failed', error)
        }
    }

    async function getUserProfile() {
        try {
            let profile = await liff.getProfile()
            let uid = profile.userId
            let pictureUrl = profile.pictureUrl
            checkuser(uid)
            $('#home').data('imguser', pictureUrl);
            $('#home').data('uuid', uid);
            $('.imgpro').attr('src', pictureUrl);
        } catch (error) {
            console.error('Failed to get profile', error)
            $('#profile').text('Failed to get profile')
        }
    }

    $(() => {
        if (!navigator.geolocation) {
            return alert('เบราว์เซอร์ไม่รองรับ Geolocation');
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
            },
            err => console.warn('Geolocation error:', err),
            { enableHighAccuracy: true }
        );

        new ResizeObserver(() => map.invalidateSize())
            .observe(document.querySelector('.ratio'));
    });
});

function checkuser(uuid) {
    showhidepage('header')
    callApi('checkuser', { "uuid": uuid })
        .then(res => {
            if (res.status === 'success') {
                Swal.fire({
                    title: res.message,
                    text: res.text,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => {
                    showhidepage('.home');
                    $('#name').val(res.name)
                    $('#rank').val(res.rank)
                    console.log(res);
                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: res.message,
                    text: res.text,
                    allowOutsideClick: false,
                    confirmButtonText: 'ตกลง',
                }).then(() => {
                    showhidepage('header');
                });
            }
        })
        .catch(() => {
            showhidepage('header');
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
                allowOutsideClick: false,
                confirmButtonText: 'ตกลง',
            });
        });
}

$('.checkin').click(async function (e) {
    e.preventDefault();
    let idform = "home";
    let itemData = await getFormData(idform);
    if (!checkvalue(itemData, ['comment'])) {
    } else {
        console.log(itemData);
        savecheckin(itemData);
    }
});

function savecheckin(itemData) {
    showhidepage('header')
    callApi('savecheckin', itemData)
        .then(res => {
            if (res.status === 'success') {
                Swal.fire({
                    title: res.message,
                    text: res.text,
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                }).then(() => {
                    let message = [
                        {
                            type: 'text',
                            text: res.msg
                        },
                        {
                            type: 'image',
                            originalContentUrl: itemData.imguser,
                            previewImageUrl: itemData.imguser
                        }
                    ];

                    liff.sendMessages([message])
                        .then(() => {
                            liff.closeWindow();
                        })
                        .catch(error => {
                            Swal.fire({
                                icon: 'error',
                                title: 'ส่งข้อความไม่สำเร็จ',
                                text: `เกิดข้อผิดพลาด: ${error.message || error}`,
                                confirmButtonText: 'ตกลง'
                            });
                        });

                });
            } else {
                Swal.fire({
                    icon: 'error',
                    title: res.message,
                    text: res.text,
                    allowOutsideClick: false,
                    confirmButtonText: 'ตกลง',
                }).then(() => {
                    showhidepage('.home');
                });
            }
        })
        .catch(() => {
            showhidepage('.home');
            Swal.fire({
                icon: 'error',
                title: 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
                allowOutsideClick: false,
                confirmButtonText: 'ตกลง',
            });
        });
}
