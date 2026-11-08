# 프로젝트 작업 규칙

- 사용자는 HTML 기반 웹앱을 요청했습니다. 루트 `index.html`을 진입점으로 유지하고 HTML, CSS, JavaScript를 분리합니다.
- 매 변경 작업을 마무리할 때 관련 검증을 수행하고 Git 커밋 및 GitHub 원격 저장소 푸시까지 진행합니다. 사용자가 해당 작업에서 별도로 지시하면 그 지시를 우선합니다.
- 기본 원격은 `origin` (https://github.com/leemangi0923/robot.git)입니다. 원격 이력을 덮어쓰는 강제 푸시는 하지 않습니다.
- 기능·지원 문법·모델·검증 결과와 한계는 `README.md`에 기록합니다.
- 테스트: `npm ci` 후 `npm test`. 배포 실행에는 npm 설치나 빌드가 필요 없습니다.
- 소스 변경 시 앱의 전체 소스 다운로드인 `source.zip`도 최신 파일로 갱신합니다. `.git`, `node_modules`, `source.zip` 자체와 인증 정보를 포함하지 않습니다.
