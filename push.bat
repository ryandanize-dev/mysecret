@echo off
setlocal enabledelayedexpansion

echo =================================================
echo       Git Push Helper - JarakKilometer
echo =================================================
echo.

:: Get commit message from user
set /p commit_msg="Masukkan pesan commit (kosongkan untuk default): "

if "!commit_msg!"=="" (
    :: Default commit message with current date and time
    set commit_msg=Update project - %date% %time%
)

echo.
echo [+] Menambahkan perubahan ke Git...
git add .

echo.
echo [+] Melakukan commit dengan pesan: "!commit_msg!"
git commit -m "!commit_msg!"

echo.
echo [+] Mengunggah ke GitHub (dan Vercel)...
git push

if %errorlevel% equ 0 (
    echo.
    echo =================================================
    echo    BERHASIL: Perubahan berhasil diunggah!
    echo    Vercel sedang membangun ulang aplikasi Anda.
    echo =================================================
) else (
    echo.
    echo =================================================
    echo    GAGAL: Terjadi kesalahan saat melakukan push.
    echo    Silakan periksa koneksi internet atau Git Anda.
    echo =================================================
)

echo.
pause
