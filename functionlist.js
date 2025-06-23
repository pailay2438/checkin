$(document).ready(function () {
    removeinvalid()
});

function showhidepage(selector) {
    $('header,main,nav').hide().removeClass('d-none')
    $(selector).show()
}

async function callApi(opt, itemData) {
    const payload = { opt, ...itemData };
    try {
        const response = await fetch(scriptUrl, {
            method: "POST",
            body: new URLSearchParams(payload),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const res = await response.json();
        return res;
    } catch (err) {
        console.error(err);
        throw err;
    }
}

function getdatatable(cacheKey, dataval, keyset, onDataUpdate, ignoreCache = false, extraParam = null) {
    return new Promise((resolve, reject) => {
        let cachedData = ignoreCache ? null : getCachedData(cacheKey);

        if (cachedData) {
            resolve(cachedData);

            fetchDataFromServer(cacheKey, dataval, keyset, extraParam).then((newData) => {
                if (!isDataSimilar(newData, cachedData, 0)) {
                    setCachedData(cacheKey, newData);
                    setCachedData(cacheKey + "_timestamp", Date.now());

                    if (typeof onDataUpdate === 'function') {
                        onDataUpdate(newData);
                    }
                }
            }).catch(error => {
                console.error("Error fetching data:", error);
            });
        } else {
            fetchDataFromServer(cacheKey, dataval, keyset, extraParam).then(data => {
                setCachedData(cacheKey, data);
                setCachedData(cacheKey + "_timestamp", Date.now());
                resolve(data);
            }).catch(error => {
                reject(error);
            });
        }
    });
}

function fetchDataFromServer(cacheKey, dataval, keyset, extraParam = null) {
    return new Promise((resolve, reject) => {
        $.ajax({
            url: scriptUrl,
            method: 'GET',
            dataType: 'text',
            data: {
                ket: cacheKey,
                val: dataval,
                ...(keyset ? { keyword: keyset } : {}),
                ...(extraParam ? { extra: extraParam } : {})
            }
            ,

            success: function (response) {
                let compressedData = atob(response);
                let compressedBytes = Uint8Array.from(compressedData, c => c.charCodeAt(0));
                let decompressedData = pako.ungzip(compressedBytes, { to: 'string' });
                let data = JSON.parse(decompressedData);

                let val = data[dataval];
                resolve(val);
            },
            error: function (jqxhr, textStatus, error) {
                let err = textStatus + ", " + error;
                console.error("Request Failed: " + err);
                reject(err);
            }
        });
    });
}

function getCachedData(key) {
    const cached = localStorage.getItem(key);
    return cached ? JSON.parse(cached) : null;
}

function setCachedData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

function isDataSimilar(data1, data2, threshold = 0.1) {
    if (!data1 || !data2) return false;
    if (data1.length !== data2.length) return false;

    let differences = 0;
    let totalCells = 0;

    data1.forEach((row, i) => {
        row.forEach((cell, j) => {
            totalCells++;
            if (cell !== data2[i][j]) {
                differences++;
            }
        });
    });

    let differenceRatio = differences / totalCells;

    return differenceRatio <= threshold;
}

function getFormData(formId) {
    let formData = {};
    let filePromises = [];
    let radioGroups = {};

    const $form = $(`#${formId}`);

    $form.find('input, select, textarea, span, img').each(function () {
        const input = $(this);
        const id = input.attr('id');
        if (!id) return;

        if (input.is('span')) {
            formData[id] = input.text();
            return;
        }

        if (input.is('img')) {
            const src = input.attr('src');
            if (src) formData[id] = src;
            const dataset = input.data();
            if (!$.isEmptyObject(dataset)) {
                formData[id + "_data"] = dataset;
            }
            return;
        }

        const value = input.val();
        const dataset = input.data();
        if (!$.isEmptyObject(dataset)) {
            formData[id + "_data"] = dataset;
        }

        if (input.is(':radio')) {
            const name = input.attr('name');
            radioGroups[name] = radioGroups[name] || [];
            radioGroups[name].push({
                id: id,
                value: value,
                checked: input.is(':checked')
            });
            return;
        }

        if (input.attr('type') === 'file') {
            const hidden = $form.find(`#${id}Urls`);
            if (hidden.length) {
                const urls = hidden.val().split(',');
                urls.forEach(u => {
                    formData[id] = formData[id] || [];
                    formData[id].push(u);
                });
            }

            const files = input[0].files;
            Array.from(files).forEach(file => {
                filePromises.push(new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => {
                        formData[id] = formData[id] || [];
                        formData[id].push(e.target.result);
                        resolve();
                    };
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                }));
            });
            return;
        }


        if (input.is(':checkbox')) {
            formData[id] = input.is(':checked') ? value : "";
        } else {
            formData[id] = value;
        }
    });

    return Promise.all(filePromises).then(() => {
        Object.values(radioGroups).forEach(radios => {
            const checked = radios.find(r => r.checked);
            if (checked) {
                formData[checked.id] = checked.value;
            } else {
                radios.forEach(r => formData[r.id] = "");
            }
        });

        const allData = $form.data();
        Object.assign(formData, allData);
        const userToken = localStorage.getItem('name');
        const branchToken = localStorage.getItem('branch');
        if (userToken) formData['name'] = userToken;
        if (branchToken) formData['branch'] = branchToken;
        formData['timestamp'] = new Date().toISOString();

        return formData;
    });
}

function clearform(id) {
    let form = $(`#${id}`);
    form.find('input, select, textarea').each(function () {
        let element = $(this);
        if (element.is('input[type="text"], input[type="date"], input[type="time"], input[type="password"], input[type="datetime-local"], input[type="file"], input[type="number"], input[type="email"], input[type="url"], input[type="tel"]')) {
            element.val('');
        } else if (element.is('input[type="checkbox"], input[type="radio"]')) {
            element.prop('checked', false).trigger('change');
        } else if (element.is('select')) {
            element.prop('selectedIndex', 0);
        } else if (element.is('textarea')) {
            element.val('');
        }
    });
    form.find('img.preview').attr('src', '');
    form.find('*').each(function () {
        $.each(this.attributes, function () {
            if (
                this.specified &&
                this.name.indexOf("data-") === 0 &&
                this.name !== "data-target"
            ) {
                $(this.ownerElement).removeAttr(this.name);
            }
        });
    });

}

function checkvalue(formData, excludeFields = []) {
    let missingFields = Object.entries(formData)
        .filter(([key, value]) => !excludeFields.includes(key))
        .filter(([key, value]) => {
            let element = $(`#${key}`);
            if (element.is(':checkbox') || element.is(':radio')) {
                return !element.is(':checked');
            } else if (element.is('select')) {
                return (
                    value === '' ||
                    value === null ||
                    value === undefined ||
                    value === element.find('option:first').val()
                );
            }
            return value === '' || value === null || value === undefined;
        })
        .map(([key, value]) => {
            let element = $(`#${key}`);
            if (element.is('select') || element.is(':radio')) {
                return element.attr('aria-placeholder') || key;
            } else {
                return element.attr('placeholder') || key;
            }
        });

    missingFields = [...new Set(missingFields)];

    if (missingFields.length > 0) {
        Object.entries(formData).forEach(([key, value]) => {
            if (!excludeFields.includes(key)) {
                let element = $(`#${key}`);
                if (element.is(':checkbox') || element.is(':radio')) {
                    if (!element.is(':checked')) {
                        element.addClass('is-invalid');
                        $(`label[for=${key}]`)
                            .removeClass('btn-outline-success btn-outline-primary')
                            .addClass('btn-outline-danger');
                    }
                } else if (element.is('select')) {
                    if (
                        value === '' ||
                        value === null ||
                        value === undefined ||
                        value === element.find('option:first').val()
                    ) {
                        element.addClass('is-invalid');
                    }
                } else if (value === '' || value === null || value === undefined) {
                    element.addClass('is-invalid');
                }
            }
        });

        Swal.fire({
            icon: 'error',
            title: 'กรุณากรอกข้อมูลให้ครบถ้วน',
            html: `${missingFields.join('<br>')}`
        });

        return false;
    }

    return true;
}

function removeinvalid() {
    $("input, select, textarea").not("#checklist1").each(function () {
        if ($(this).is(":radio") || $(this).is(":checkbox")) {
            $(this).prop("checked", false);
        } else {
            $(this).val("");
        }
        $(this).removeClass("is-invalid");
    });

    $("input:radio").each(function () {
        let groupName = $(this).attr("name");
        $(`input[name='${groupName}']`).each(function () {
            let labelId = $(this).attr("id");
            $(`label[for='${labelId}']`)
                .removeClass("btn-outline-danger is-invalid")
                .addClass("btn-outline-primary");
        });
    });

    $(document).on("input change", "input, select, textarea", function () {
        let isEmpty = false;
        if ($(this).is(":radio") || $(this).is(":checkbox")) {
            isEmpty = !$(this).is(":checked");
        } else {
            isEmpty = ($(this).val().trim() === "");
        }
        if (!isEmpty) {
            $(this).removeClass("is-invalid");
            if ($(this).is(":radio")) {
                let groupName = $(this).attr("name");
                $(`input[name='${groupName}']`).each(function () {
                    let labelId = $(this).attr("id");
                    $(`label[for='${labelId}']`)
                        .removeClass("btn-outline-danger is-invalid")
                        .addClass("btn-outline-primary");
                });
            }
        }
    });
}

function enableSelected(containerId, excludeIds) {
    let $fields = $('#' + containerId).find('input, select, textarea');
    if (Array.isArray(excludeIds) && excludeIds.length > 0) {
        let excludeSelector = excludeIds.map(id => `#${id}`).join(', ');
        $fields = $fields.not(excludeSelector);
    }
    $fields.removeClass('disabled').prop('disabled', false);
}

function createlist(selector, pageOptions) {
    let dropdown = $(selector);
    dropdown.empty();

    pageOptions.forEach(function (option) {
        let value = option === 'All' ? 'All' : option;
        let text = option === 'All' ? 'ทั้งหมด' : option;
        dropdown.append(`<option value="${value}">${text}</option>`);
    });
}

function createPagination(selector, totalPages, currentPage, onPageChange) {
    let pagination = $(selector);
    pagination.empty();

    if (totalPages > 5 && currentPage > 1) {
        pagination.append(`
            <li class="page-item">
                <a class="page-link" href="javascript:void(0);" data-page="1">&laquo;&laquo;</a>
            </li>
        `);
    }

    let prevDisabled = (currentPage === 1) ? 'disabled' : '';
    pagination.append(`
        <li class="page-item ${prevDisabled}">
            <a class="page-link" href="javascript:void(0);" data-page="${currentPage - 1}">&laquo;</a>
        </li>
    `);

    let startPage = 1;
    let endPage = 5;

    if (totalPages > 5) {
        if (currentPage > 3) {
            startPage = Math.max(1, currentPage - 2);
            endPage = Math.min(totalPages, currentPage + 2);
        }

        if (currentPage + 2 > totalPages) {
            startPage = Math.max(1, totalPages - 4);
        }
    } else {
        endPage = totalPages;
    }

    for (let i = startPage; i <= endPage; i++) {
        let active = (i === currentPage) ? 'active' : '';
        pagination.append(`
            <li class="page-item ${active}">
                <a class="page-link" href="javascript:void(0);" data-page="${i}">${i}</a>
            </li>
        `);
    }

    let nextDisabled = (currentPage === totalPages) ? 'disabled' : '';
    pagination.append(`
        <li class="page-item ${nextDisabled}">
            <a class="page-link" href="javascript:void(0);" data-page="${currentPage + 1}">&raquo;</a>
        </li>
    `);

    if (totalPages > 5 && currentPage < totalPages) {
        pagination.append(`
            <li class="page-item">
                <a class="page-link" href="javascript:void(0);" data-page="${totalPages}">&raquo;&raquo;</a>
            </li>
        `);
    }

    $(document).off('click', `${selector} .page-link`);
    $(document).on('click', `${selector} .page-link`, function (e) {
        e.preventDefault();
        let page = $(this).data('page');
        if (page > 0 && page <= totalPages) {
            onPageChange(page);
        }
    });
}

let darkModeEnabled = localStorage.getItem('darkMode') === 'true';

if (darkModeEnabled) {
    enableDarkMode();
} else {
    disableDarkMode();
}

$('#darkModeIcon').on('click', function () {
    if ($('body').attr('data-bs-theme') === 'dark') {
        disableDarkMode();
        localStorage.setItem('darkMode', 'false');
    } else {
        enableDarkMode();
        localStorage.setItem('darkMode', 'true');
    }
});

function enableDarkMode() {
    $('body').attr('data-bs-theme', 'dark');
    $('.navbar').removeClass('bg-light navbar-light').addClass('bg-dark navbar-dark');
    $('.theme-dependent').removeClass('bg-light text-dark').addClass('bg-dark text-light');
    $('#darkModeIcon').removeClass('bi-sun').addClass('bi-moon');
}

function disableDarkMode() {
    $('body').attr('data-bs-theme', 'light');
    $('.navbar').removeClass('bg-dark navbar-dark').addClass('bg-light navbar-light');
    $('.theme-dependent').removeClass('bg-dark text-light').addClass('bg-light text-dark');
    $('#darkModeIcon').removeClass('bi-moon').addClass('bi-sun');
}

function openImagePopup(imageUrl, nameimg = 'ภาพตัวอย่าง', altText = 'ภาพตัวอย่าง') {
    if (!imageUrl) {
        console.error('ไม่พบ URL ของภาพที่จะแสดง');
        return;
    }

    const updatePopupImageSize = () => {
        const popup = Swal.getPopup();
        if (popup) {
            popup.style.maxHeight = '90vh';
            popup.style.maxWidth = '90vw';
            const img = popup.querySelector('#swalImage');
            if (img) {
                const reservedHeight = 100;
                const reservedWidth = 50;
                const availableHeight = window.innerHeight * 0.9 - reservedHeight;
                const availableWidth = window.innerWidth * 0.9 - reservedWidth;
                img.style.maxHeight = availableHeight + 'px';
                img.style.maxWidth = availableWidth + 'px';
            }
        }
    };

    Swal.fire({
        title: `<strong>${nameimg}</strong>`,
        html: `<img id="swalImage" src="${imageUrl}" alt="${altText}" onerror="this.src='path/to/fallback-image.jpg'" style="display: block; margin: 0 auto; width: auto; height: auto; border-radius: 10px;"/>`,
        background: '#f7f9fc',
        showCloseButton: true,
        showConfirmButton: false,
        width: 'auto',
        padding: '1em',
        customClass: {
            popup: 'custom-swal-popup'
        },
        didOpen: () => {
            updatePopupImageSize();
            window.addEventListener('resize', updatePopupImageSize);
        },
        didClose: () => {
            window.removeEventListener('resize', updatePopupImageSize);
        }
    });
}

function checkAndFormatDate(cellData) {
    if (typeof cellData === 'string') {
        if ((cellData.includes('T') && cellData.includes('Z')) || cellData.includes('GMT')) {
            return formatDate(cellData);
        }
    }
    return cellData;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const options = {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Bangkok'
    };
    return new Intl.DateTimeFormat('th-TH', options).format(date);
}
