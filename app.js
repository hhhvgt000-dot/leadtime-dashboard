// app.js

var hasDataLabels = typeof ChartDataLabels !== 'undefined';
Chart.defaults.font.family = 'Arial';
if (hasDataLabels) {
    Chart.register(ChartDataLabels);
    // Set global defaults — no per-chart datalabels config needed
    Chart.defaults.plugins.datalabels = {
        display: function (ctx) { return ctx.dataset.data[ctx.dataIndex] !== 0; },
        clamp: false,
        textAlign: 'center',
        labels: {
            value: {
                anchor: 'end',
                align: function (ctx) { return ctx.dataset.data[ctx.dataIndex] < 0 ? 'bottom' : 'top'; },
                color: '#000000',
                font: { weight: 'bold', size: 11 },
                formatter: function (v) { return v !== 0 ? v.toLocaleString() : ''; }
            },
            percentage: {
                anchor: 'center',
                align: 'center',
                color: function (ctx) {
                    var bg = ctx.dataset.backgroundColor;
                    var barColor = Array.isArray(bg) ? bg[ctx.dataIndex] : bg;
                    return barColor === '#66FF00' ? '#000000' : '#ffffff';
                },
                font: { weight: 'bold', size: 10 },
                formatter: function (v, ctx) {
                    if (v <= 0) return ''; // hide % label for zero/negative bars
                    // 양수(0보다 큰 값)들만 더해서 분모(total) 구하기
                    var total = ctx.dataset.data.reduce(function (sum, val) {
                        return val > 0 ? sum + val : sum;
                    }, 0);
                    return total > 0 ? Math.round(v / total * 100) + '%' : '';
                }
            }
        }
    };
}

let chartInstances = [];

// DOM Elements
const monthSelect = document.getElementById('month-select');
const dashboardContent = document.getElementById('dashboard-content');
const statusMessage = document.getElementById('status-message');
const teamsContainer = document.getElementById('teams-container');
const summaryContainer = document.getElementById('summary-container');

// Color pairs per month index: [bold for feb1, pastel for feb2]
var MONTH_COLORS = [
    ['#ef4444', '#fca5a5'], // D-0   red
    ['#00BFFF', '#99E5FF'], // D-30  bright cyan blue
    ['#66FF00', '#BBFF80'], // D-60  lime green
    ['#c084fc', '#e9d5ff'], // D-90  light purple
    ['#16a34a', '#86efac'], // D-120 green
    ['#0891b2', '#67e8f9'], // D-150 cyan
    ['#4f46e5', '#a5b4fc'], // D-180 indigo
    ['#be185d', '#fbcfe8'], // D-210 rose
    ['#059669', '#6ee7b7'], // D-240 emerald
    ['#0284c7', '#7dd3fc'], // D-270 sky
    ['#9333ea', '#d8b4fe'], // D-300 purple
    ['#2563eb', '#93c5fd'], // D-330 blue
];

const TEAM_GROUPS = [
    { name: '동남아 / 국내', borderColor: '#3b82f6', keywords: ['동남아1팀', '동남아2팀', '필리핀/말레이시아파트', '태국파트', '국내팀'] },
    { name: '중국 / 일본 / 지방', borderColor: '#6366f1', keywords: ['중국팀', '일본팀', '부산지점', '대구지점'] },
    { name: '유럽 / 프리미엄', borderColor: '#10b981', keywords: ['서유럽팀', '스페인/북유럽팀', '동유럽팀', '지중해/인도/아프리카팀', '프리미엄팀'] },
    { name: '미주 / 남태평양', borderColor: '#f43f5e', keywords: ['미주팀', '남태평양팀'] }
];

document.addEventListener('DOMContentLoaded', () => {
    // Password Protection Logic
    const PASSCODE = 'vgt1234'; // 초기 비밀번호 (문자 형태여야 함)
    const pwOverlay = document.getElementById('password-overlay');
    const pwForm = document.getElementById('password-form');
    const pwInput = document.getElementById('password-input');
    const pwError = document.getElementById('password-error');

    if (pwForm) {
        pwForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (pwInput.value === PASSCODE) {
                // 비밀번호 일치 시
                pwOverlay.style.opacity = '0';
                setTimeout(() => {
                    pwOverlay.classList.add('hidden');
                    document.body.classList.remove('overflow-hidden');
                }, 300);
            } else {
                // 비밀번호 불일치 시
                pwError.classList.remove('hidden');
                pwInput.value = '';
                pwInput.focus();
            }
        });
    }

    if (monthSelect) {
        monthSelect.addEventListener('change', handleMonthSelect);
    }
});

async function handleMonthSelect(e) {
    const selectedMonth = e.target.value;
    if (!selectedMonth) {
        if (dashboardContent) dashboardContent.classList.add('hidden');
        if (statusMessage) statusMessage.innerHTML = '<span style="font-weight:bold; font-size:18px; color:#475569;">월을 선택해주세요.</span>';
        return;
    }

    if (dashboardContent) dashboardContent.classList.remove('hidden');
    if (teamsContainer) teamsContainer.innerHTML = '';
    if (summaryContainer) summaryContainer.innerHTML = '';
    if (statusMessage) statusMessage.innerHTML = `<span style="color:#2563eb">${selectedMonth}월 데이터를 불러오는 중입니다...</span>`;

    chartInstances.forEach(c => c.destroy());
    chartInstances = [];

    const maxWeeks = 6; // 최대 6주차까지 수집 시도
    let fetchedWeeks = [];

    for (let w = 1; w <= maxWeeks; w++) {
        const fileNameSpace = `${selectedMonth}월 ${w}주차.json`;
        const fileNameNoSpace = `${selectedMonth}월_${w}주차.json`;

        try {
            let response = await fetch(fileNameSpace);
            if (!response.ok) response = await fetch(fileNameNoSpace);

            if (response.ok) {
                const rawData = await response.json();
                fetchedWeeks.push({
                    label: `${selectedMonth}월 ${w}주차`,
                    rawData: rawData
                });
            }
        } catch (err) { }
    }

    if (fetchedWeeks.length === 0) {
        statusMessage.innerHTML = `<span style="color:red;font-weight:bold">${selectedMonth}월에 해당하는 파일 업로드 전입니다.</span>`;
        if (dashboardContent) dashboardContent.classList.add('hidden');
        return;
    }

    processFetchedData(fetchedWeeks, parseInt(selectedMonth));
}

function processFetchedData(fetchedWeeks, selectedMonthNum) {
    try {
        let monthMap = {};
        let weeksInfo = [];

        fetchedWeeks.forEach(fw => {
            let teamData = {};
            fw.rawData.forEach(row => {
                const teamName = row['Team'] || row['팀명'] || row['팀'];
                if (!teamName || String(teamName).trim() === '') return;

                const tn = String(teamName).trim();
                if (!teamData[tn]) teamData[tn] = {};

                Object.keys(row).forEach(key => {
                    const k = String(key).trim();
                    if (k !== 'Team' && k !== '팀명' && k !== '팀' && k !== '') {
                        const translatedLabel = translateMonth(k, selectedMonthNum);
                        const v = parseFloat(row[key]);
                        if (!isNaN(v)) {
                            teamData[tn][translatedLabel] = v;
                            monthMap[translatedLabel] = true;
                        }
                    }
                });
            });
            weeksInfo.push({ label: fw.label, teamData: teamData });
        });

        // D-0, D-30 순으로 정렬하기 (숫자 오름차순)
        var months = Object.keys(monthMap).sort((a, b) => {
            let numA = parseInt(a.replace('D-', '')) || 0;
            let numB = parseInt(b.replace('D-', '')) || 0;
            return numA - numB;
        });

        if (months.length === 0) throw new Error('월(Month) 헤더를 찾을 수 없습니다.');

        if (statusMessage) statusMessage.innerHTML = '';
        renderSummary(weeksInfo, months);
        renderTeamCharts(weeksInfo, months);
    } catch (e) {
        console.error(e);
        if (statusMessage) statusMessage.innerHTML = '<div style="color:red;font-weight:bold;padding:16px;border:1px solid #fecaca;background:#fef2f2;border-radius:8px">오류: ' + e.message + '</div>';
    }
}

function renderSummary(weeksInfo, months) {
    var container = document.getElementById('summary-container');
    if (!container) return;

    function grandTotal(data) {
        return Object.values(data).reduce(function (sum, teamMonths) {
            return sum + Object.values(teamMonths).reduce(function (a, b) { return a + b; }, 0);
        }, 0);
    }

    const bgColors = ['#1d4ed8', '#0891b2', '#7c3aed', '#059669', '#d97706', '#be123c'];

    let weeksCards = weeksInfo.map((week, idx) => {
        let t = grandTotal(week.teamData);
        return {
            label: week.label,
            total: t,
            bg: bgColors[idx % bgColors.length]
        };
    });

    var html = '<div style="display:grid;grid-template-columns:repeat(' + weeksInfo.length + ',1fr);gap:16px;margin-bottom:4px">';
    weeksCards.forEach(function (w) {
        html += '<div style="background:' + w.bg + ';border-radius:14px;padding:24px 20px;display:flex;flex-direction:column;align-items:center;gap:6px;box-shadow:0 2px 8px rgba(0,0,0,0.12)">';
        html += '<span style="font-size:19px;font-weight:600;color:rgba(255,255,255,0.85);letter-spacing:0.3px">' + w.label + ' 전체 예약 증감</span>';

        // 양수일 때만 + 기호 추가, 음수는 toLocaleString()에서 자동으로 - 기호가 붙음
        let sign = w.total > 0 ? '+' : '';
        html += '<span style="font-size:36px;font-weight:800;color:#ffffff;letter-spacing:-1px">' + sign + w.total.toLocaleString() + '</span>';
        html += '</div>';
    });
    html += '</div>';

    container.innerHTML = html;
}

function renderTeamCharts(weeksInfo, months) {
    var container = document.getElementById('teams-container');
    if (!container) return;
    container.innerHTML = '';

    var allTeams = {};
    weeksInfo.forEach(w => {
        Object.keys(w.teamData).forEach(t => allTeams[t] = true);
    });
    var allTeamList = Object.keys(allTeams);

    var chartCounter = 0;

    TEAM_GROUPS.forEach(function (group) {
        var groupTeams = allTeamList.filter(function (team) {
            var normalized = team.replace(/\s+/g, '');
            return group.keywords.some(function (k) { return normalized.includes(k.replace(/\s+/g, '')); });
        });
        if (groupTeams.length === 0) return;

        var regionHeader = document.createElement('div');
        regionHeader.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:16px;margin-bottom:4px';
        regionHeader.innerHTML = '<span style="display:inline-block;width:4px;height:28px;border-radius:4px;background:' + group.borderColor + '"></span>'
            + '<span style="font-weight:bold;font-size:18px;color:#334155">' + group.name + '</span>'
            + '<span style="font-size:14px;color:#94a3b8">' + groupTeams.length + '개 팀</span>';
        container.appendChild(regionHeader);

        groupTeams.forEach(function (team) {
            try {
                let teamWeeksData = weeksInfo.map(w => {
                    let vals = months.map(m => (w.teamData[team] && w.teamData[team][m] !== undefined) ? w.teamData[team][m] : 0);
                    let tot = vals.reduce((a, b) => a + b, 0);
                    return { label: w.label, values: vals, total: tot };
                });

                function fmtDiff(d) {
                    var s = d > 0 ? '+' : '';
                    var style = d > 0 ? 'color:#059669' : d < 0 ? 'color:#f43f5e' : 'color:#94a3b8';
                    return '<span style="font-weight:bold;font-size:13px;' + style + '">' + s + d.toLocaleString() + '</span>';
                }

                // Header HTML
                let headerRightHtml = '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px">';
                const headerBgs = ['#f0fdf4', '#eff6ff', '#eef2ff', '#fdf4ff', '#fffbeb'];
                const headerTextColors = ['#15803d', '#1d4ed8', '#4338ca', '#a21caf', '#b45309'];

                teamWeeksData.forEach((tw, idx) => {
                    if (idx > 0) {
                        let diff = tw.total - teamWeeksData[idx - 1].total;
                        headerRightHtml += `<span style="font-size:11px;color:#94a3b8">→</span>${fmtDiff(diff)}`;
                    }
                    let bg = headerBgs[idx % headerBgs.length];
                    let tc = headerTextColors[idx % headerTextColors.length];
                    let shortLabel = tw.label.replace('차', '');

                    headerRightHtml += `<span style="background:${bg};color:${tc};border-radius:999px;padding:2px 12px;font-weight:600">${shortLabel}: <strong>${tw.total.toLocaleString()}</strong></span>`;
                });
                headerRightHtml += '</div>';

                var allValues = [];
                teamWeeksData.forEach(tw => allValues.push(...tw.values));
                var rawMax = Math.max.apply(null, allValues.length ? allValues : [0]);
                var rawMin = Math.min.apply(null, allValues.length ? allValues : [0]);
                var yMax = rawMax > 0 ? Math.ceil(rawMax * 1.15 / 100) * 100 : 100;
                var yMin = rawMin < 0 ? Math.floor(rawMin * 1.15 / 100) * 100 : 0;

                var card = document.createElement('div');
                card.style.cssText = 'background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);border:1px solid #f1f5f9;padding:20px;margin-bottom:8px';

                var headerDiv = document.createElement('div');
                headerDiv.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px';
                headerDiv.innerHTML = '<h4 style="font-weight:700;color:#ffffff;font-size:15px;margin:0;background:' + group.borderColor + ';padding:4px 14px;border-radius:6px;display:inline-block;letter-spacing:-0.3px;box-shadow:0 1px 4px rgba(0,0,0,0.15)">' + team + '</h4>'
                    + headerRightHtml;
                card.appendChild(headerDiv);

                var chartsRow = document.createElement('div');
                chartsRow.style.cssText = 'display:grid;grid-template-columns:repeat(' + teamWeeksData.length + ', 1fr);gap:16px';

                function makeChartCell(canvasId, label, values, yMax) {
                    var cell = document.createElement('div');
                    var title = document.createElement('p');
                    title.style.cssText = 'font-size:16px;font-weight:700;color:#1e293b;margin:0 0 2px 0;text-align:center;letter-spacing:-0.5px';
                    title.textContent = label;
                    cell.appendChild(title);

                    var chartDiv = document.createElement('div');
                    chartDiv.style.cssText = 'position:relative;height:200px;width:100%';
                    var canvas = document.createElement('canvas');
                    canvas.id = canvasId;
                    chartDiv.appendChild(canvas);
                    cell.appendChild(chartDiv);

                    var ctx = canvas.getContext('2d');
                    var chart = new Chart(ctx, {
                        type: 'bar',
                        data: {
                            labels: months,
                            datasets: [{
                                label: label,
                                data: values,
                                backgroundColor: months.map(function (m, i) { return MONTH_COLORS[i % MONTH_COLORS.length][0]; }),
                                borderRadius: 0,
                                barPercentage: 0.92,
                                categoryPercentage: 1.0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            layout: { padding: { top: 20 } },
                            scales: {
                                y: {
                                    min: yMin,
                                    max: yMax,
                                    ticks: { font: { size: 10 }, color: '#000000' },
                                    grid: {
                                        drawBorder: true,
                                        drawOnChartArea: true,
                                        color: function (ctx) {
                                            return ctx.tick.value === 0 ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.05)';
                                        },
                                        lineWidth: function (ctx) {
                                            return ctx.tick.value === 0 ? 1.5 : 1;
                                        }
                                    }
                                },
                                x: {
                                    ticks: { font: { size: 10 }, color: '#000000' },
                                    grid: { drawBorder: true, drawOnChartArea: false }
                                }
                            },
                            plugins: {
                                legend: { display: false },
                                tooltip: {
                                    callbacks: {
                                        label: function (item) { return ' ' + item.dataset.label + ': ' + item.parsed.y.toLocaleString(); }
                                    }
                                }
                            }
                        }
                    });
                    chartInstances.push(chart);
                    return cell;
                }

                teamWeeksData.forEach((tw, wIdx) => {
                    chartCounter++;
                    chartsRow.appendChild(makeChartCell('chart_' + chartCounter + '_' + wIdx, tw.label, tw.values, yMax));
                });
                card.appendChild(chartsRow);
                container.appendChild(card);

            } catch (teamErr) {
                console.error('Chart render error for team [' + team + ']:', teamErr);
            }
        });
    });
}

// ─── Utils ────────────────────────────────────────────────
function translateMonth(str, selectedMonthNum) {
    let s = str.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
    let monthMap = {
        'january': 1, 'jan': 1, '1월': 1,
        'february': 2, 'feb': 2, '2월': 2,
        'march': 3, 'mar': 3, '3월': 3,
        'april': 4, 'apr': 4, '4월': 4,
        'may': 5, '5월': 5,
        'june': 6, 'jun': 6, '6월': 6,
        'july': 7, 'jul': 7, '7월': 7,
        'august': 8, 'aug': 8, '8월': 8,
        'september': 9, 'sep': 9, 'sept': 9, '9월': 9,
        'october': 10, 'oct': 10, '10월': 10,
        'november': 11, 'nov': 11, '11월': 11,
        'december': 12, 'dec': 12, '12월': 12
    };

    let targetMonthNum = null;
    for (let key in monthMap) {
        if (s.includes(key) || s === key) {
            targetMonthNum = monthMap[key];
            break;
        }
    }

    if (targetMonthNum !== null && selectedMonthNum) {
        let diff = targetMonthNum - selectedMonthNum;
        if (diff < 0) diff += 12; // 내년으로 넘어가는 경우
        return 'D-' + (diff * 30);
    }

    // 매칭 안될 경우 원본 반환 (이미 D-xx 형태일 수도 있음)
    return str;
}
