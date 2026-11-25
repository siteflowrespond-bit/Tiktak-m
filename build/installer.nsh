; flock.tt (c) 2026 siteflowrespond-bit. Owner proof sha256:99891628516a57a623400d9ccde22b170ecfac1527631e923149d480260a9270
; Custom wording for the flock.tt installer (electron-builder includes this file).

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    !define MUI_FINISHPAGE_TITLE "flock.tt is ready"
    !define MUI_FINISHPAGE_TEXT "Open flock.tt, type your TikTok username and press Connect.$\r$\n$\r$\nKeep the app open while you stream. TikTok LIVE Studio and OBS load your overlays from it.$\r$\n$\r$\nHave a live you won't forget."
    !define MUI_FINISHPAGE_RUN_TEXT "Open flock.tt now"
  !endif
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to flock.tt"
  !define MUI_WELCOMEPAGE_TEXT "Alerts, sounds, animated overlays and OBS scene changes for your TikTok LIVE.$\r$\n$\r$\nflock.tt runs only on your computer. It has no accounts, no tracking and no ads, and installs no other software.$\r$\n$\r$\nPrivacy: flocktt.xyz/privacy.html$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
