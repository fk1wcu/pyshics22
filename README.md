# 물리2 - HTML/CSS 구현

Figma 디자인을 HTML/CSS로 옮긴 프로젝트입니다.

## 폴더 구조

```
figma-clone/
├── server.js                       # Express 서버
├── package.json
├── README.md
└── public/
    ├── index.html                  # 메인 HTML (모든 CSS를 한 번에 로드)
    └── css/
        ├── main.css                # 전체 레이아웃
        ├── buttons/                # 각 버튼마다 CSS 분리
        │   ├── upload-area.css        # 이미지 업로드 영역
        │   ├── first-photo-btn.css    # "첫 번째 사진 선택"
        │   ├── last-photo-btn.css     # "마지막 사진 선택"
        │   └── eyedropper-btn.css     # 스포이드
        └── components/             # 기타 컴포넌트 CSS
            ├── color-swatch.css       # 첫/마지막 색상 표시
            ├── hsv-display.css        # 상단 H/S/V 카드
            └── image-area.css         # 메인 이미지 영역
```

## 실행 방법

```bash
# 1. 의존성 설치 (최초 1회)
npm install

# 2. 서버 실행
npm start

# 3. 브라우저에서 접속
# http://localhost:3000
```

## 사용된 색상

| HEX     | 용도 |
|---------|------|
| #D9D9D9 | 보더, 색상박스 테두리 |
| #232121 | 사이드바 배경, 버튼 배경, 메인 텍스트 |
| #F2F2F7 | 메인 배경 |
| #464549 | 버튼 보더, 색상 섹션 구분선 |

## 디자인 사양

- 화면 크기: **1440 × 1024 (고정)**
- 폰트: Pretendard (한글 웹폰트, CDN 로드)
- 화면 맞춤(반응형)으로 전환할 경우 `main.css`의 고정 폭/높이를 `100vw / 100vh` 등으로 바꾸면 됩니다.
