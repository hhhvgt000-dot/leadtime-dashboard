document.addEventListener('DOMContentLoaded', () => {
    const monthSelect = document.getElementById('month-select');
    const dashboardContent = document.getElementById('dashboard-content');
    const teamsContainer = document.getElementById('teams-container');
    const statusMessage = document.getElementById('status-message');

    // 차트 인스턴스 저장용 (다시 그릴 때 이전 차트 파괴)
    let chartInstances = {};

    monthSelect.addEventListener('change', async (e) => {
        const selectedMonth = e.target.value;
        if (!selectedMonth) {
            dashboardContent.classList.add('hidden');
            statusMessage.textContent = '월을 선택해주세요.';
            return;
        }

        dashboardContent.classList.remove('hidden');
        teamsContainer.innerHTML = '';
        statusMessage.textContent = `${selectedMonth}월 데이터를 불러오는 중입니다...`;

        // 차트 초기화
        for (let key in chartInstances) {
            chartInstances[key].destroy();
        }
        chartInstances = {};

        // 최대 5주차까지 fetch 시도
        const maxWeeks = 5;
        const weeklyData = {}; // { "1주차": [ {Team: "A", Feb: 10, ...}, ... ], "2주차": ... }
        let fetchCount = 0;

        for (let w = 1; w <= maxWeeks; w++) {
            // 파일명 명명 규칙: "2월 1주차.json" 등
            const fileNameSpace = `${selectedMonth}월 ${w}주차.json`;
            const fileNameNoSpace = `${selectedMonth}월_${w}주차.json`; // 혹시 몰라 언더바도 체크
            
            try {
                let response = await fetch(fileNameSpace);
                if (!response.ok) {
                    response = await fetch(fileNameNoSpace);
                }
                
                if (response.ok) {
                    const data = await response.json();
                    weeklyData[`${w}주차`] = data;
                    fetchCount++;
                }
            } catch (err) {
                // 파일이 없으면 404가 뜨는 것은 정상이므로 무시
            }
        }

        if (fetchCount === 0) {
            statusMessage.textContent = `${selectedMonth}월에 해당하는 데이터(JSON 파일)를 찾을 수 없습니다. (예: ${selectedMonth}월 1주차.json 파일을 깃허브에 업로드해주세요)`;
            dashboardContent.classList.add('hidden');
            return;
        }

        statusMessage.textContent = '';
        renderDashboard(weeklyData);
    });

    function renderDashboard(weeklyData) {
        // weeklyData = { "1주차": [...], "2주차": [...] }
        
        // 1. 모든 주차에서 사용된 달(Month) 컬럼명(x축 대상) 추출 및 팀 목록 추출
        const availableWeeks = Object.keys(weeklyData).sort();
        const teamsSet = new Set();
        let allMonthsSet = new Set();

        availableWeeks.forEach(week => {
            const dataArray = weeklyData[week];
            dataArray.forEach(row => {
                // 팀 이름 컬럼 찾기 (Team, 팀명, 팀 중 하나)
                const teamName = row['Team'] || row['팀명'] || row['팀'];
                if (teamName) teamsSet.add(teamName);

                // 월 컬럼들 (팀명 제외한 모든 키)
                Object.keys(row).forEach(key => {
                    const k = key.trim();
                    if (k !== 'Team' && k !== '팀명' && k !== '팀' && k !== '') {
                        allMonthsSet.add(k);
                    }
                });
            });
        });

        // 2. 월 정렬 (January, February 같은 영어, 또는 1월, 2월 등 형태 대비)
        const allMonths = Array.from(allMonthsSet);
        const monthOrder = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        allMonths.sort((a, b) => {
            let idxA = monthOrder.findIndex(m => a.toLowerCase().includes(m.toLowerCase()));
            let idxB = monthOrder.findIndex(m => b.toLowerCase().includes(m.toLowerCase()));
            
            // 한글 월 (1월, 2월..) 체크
            if(idxA === -1) {
                const matchA = a.match(/(\d+)월/);
                if(matchA) idxA = parseInt(matchA[1]);
            }
            if(idxB === -1) {
                const matchB = b.match(/(\d+)월/);
                if(matchB) idxB = parseInt(matchB[1]);
            }

            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            return 0;
        });

        const teams = Array.from(teamsSet);

        // 3. 팀별 차트 렌더링
        teams.forEach((team, tIdx) => {
            // 차트 컨테이너 생성
            const chartWrapper = document.createElement('div');
            chartWrapper.className = 'bg-white p-6 rounded-xl shadow-sm border border-slate-100 transition-all hover:shadow-md';
            
            const titleEl = document.createElement('h3');
            titleEl.className = 'font-bold text-lg text-slate-800 mb-4 text-center';
            titleEl.textContent = team;
            chartWrapper.appendChild(titleEl);

            const canvasWrapper = document.createElement('div');
            canvasWrapper.className = 'relative h-64';
            const canvas = document.createElement('canvas');
            canvas.id = `chart-${tIdx}`;
            canvasWrapper.appendChild(canvas);
            
            chartWrapper.appendChild(canvasWrapper);
            teamsContainer.appendChild(chartWrapper);

            // 데이터셋 생성 (각 주차별 데이터)
            const datasets = [];
            const colors = [
                'rgba(54, 162, 235, 1)',   // 파랑 (1주차)
                'rgba(255, 99, 132, 1)',   // 빨강 (2주차)
                'rgba(75, 192, 192, 1)',   // 청록 (3주차)
                'rgba(255, 159, 64, 1)',   // 주황 (4주차)
                'rgba(153, 102, 255, 1)'   // 보라 (5주차)
            ];

            availableWeeks.forEach((week, wIdx) => {
                const dataArray = weeklyData[week];
                // 해당 팀의 데이터 행 찾기
                const teamRow = dataArray.find(row => (row['Team'] || row['팀명'] || row['팀']) === team);
                
                const dataPoints = allMonths.map(month => {
                    if (!teamRow) return null;
                    const realKey = Object.keys(teamRow).find(k => k.trim() === month);
                    const val = realKey ? teamRow[realKey] : null;
                    // 값이 비어있으면 null로 처리해 끊어 보여줌
                    return (val !== null && val !== undefined && val !== '') ? Number(val) : null;
                });

                datasets.push({
                    label: week,
                    data: dataPoints,
                    borderColor: colors[wIdx % colors.length],
                    backgroundColor: colors[wIdx % colors.length].replace('1)', '0.5)'),
                    borderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    tension: 0.1, // 약간 둥글게
                    spanGaps: true // null 값 건너뛰고 선 잇기
                });
            });

            const ctx = canvas.getContext('2d');
            
            chartInstances[canvas.id] = new Chart(ctx, {
                type: 'line', // 또는 'bar', 예약 비교는 주로 line 차트로 추세를 봄
                data: {
                    labels: allMonths, // 동적 월(x축)
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                padding: 20,
                                font: { size: 12 }
                            }
                        },
                        tooltip: {
                            mode: 'index',
                            intersect: false,
                            backgroundColor: 'rgba(255, 255, 255, 0.9)',
                            titleColor: '#1e293b',
                            bodyColor: '#334155',
                            borderColor: '#e2e8f0',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        x: {
                            grid: { display: false }
                        },
                        y: {
                            beginAtZero: true,
                            grid: {
                                borderDash: [2, 4],
                                color: '#f1f5f9'
                            }
                        }
                    }
                }
            });
        });
    }
});
