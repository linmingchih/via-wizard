[English](README.md) | [繁體中文](README.zh-TW.md)

# Via Wizard

Via Wizard 是一個強大的 GUI 工具，旨在簡化 PCB 過孔 (Via) 的建立和模擬流程。它利用 **Ansys AEDT** (透過 `pyedb`) 直接從使用者友善的介面生成高保真模擬模型。

[![Via Wizard Demo](http://img.youtube.com/vi/z5gnXKUB2Dc/0.jpg)](https://www.youtube.com/watch?v=z5gnXKUB2Dc)

## 功能

### 1. 堆疊管理 (Stackup Management)
*   **視覺化編輯器**: 檢視和編輯層屬性 (厚度、Dk、Df、導電率)。
*   **匯入/匯出**: 使用 XML 格式載入和儲存堆疊。
*   **Excel 整合**: 直接從 Excel 貼上堆疊資料到應用程式中。
*   **2D 視覺化**: 即時顯示層堆疊的視覺呈現。
*   **DogBone 挖空自定義**: 自定義參考層上差分對的挖空形狀。
    *   **-1**: 預設 Antipad 尺寸。
    *   **0**: 不建立挖空。
    *   **>0**: 指定寬度的矩形挖空。

    ![DogBone 挖空示意圖](document/dogbone.png)

### 2. 焊盤設計 (Padstack Design)
*   **可自訂幾何形狀**: 定義孔徑、焊盤尺寸和反焊盤 (Antipad) 尺寸。
*   **材料選擇**: 選擇標準材料，如銅、金或鋁。
*   **背鑽設定 (Backdrill Settings)**: 設定背鑽參數 (深度、殘樁、截止層) 以最佳化訊號完整性。
*   **填孔支援 (Fill Via Support)**: 為背鑽過孔啟用 "Fill" 功能，並自定義介電屬性 (Dk, Df)。填孔會自動以指定的背鑽直徑和材料建立並放置。

### 3. 互動式佈局 (Interactive Placement)
*   **畫布編輯器**: 在虛擬 PCB 畫布上互動式放置過孔。
*   **佈局模式**:
    *   **單一過孔**: 放置個別訊號過孔。
    *   **差分對**: 放置具有可設定間距和方向的差分對。
    *   **差分對 (含接地)**: 放置帶有周圍接地過孔的差分對。
    *   **接地過孔**: 放置接地過孔。
*   **網格系統**: 貼齊網格功能以進行精確對齊。
*   **屬性表格 (Property Table)**: 在結構化表格中檢視和編輯實例屬性，支援**可折疊區塊**以獲得更整潔的介面。
*   **進階出線控制 (Advanced Fan-out Control)**: 設定差分對的出線幾何形狀，包括轉彎角度 (例如 45 度)、直線長度和半徑。
*   **動態排序 (Dynamic Sorting)**: 放置的實例會自動按字母順序排序，便於管理。
*   **優化介面**: "已放置實例 (Placed Instances)" 面板高度已調整，以提供更佳的屬性檢視體驗。
*   **智慧複製/貼上 (Smart Copy/Paste)**: 複製和貼上實例時自動遞增名稱 (例如 `Via_1` -> `Via_2`) 以確保名稱唯一性。

### 4. 模擬匯出 (Simulation Export)
*   **AEDB 生成**: 將整個設計 (堆疊、焊盤、放置實例) 匯出為 Ansys AEDB 專案 (`.aedb`)。
*   **版本控制**: 指定目標 AEDB 版本 (預設: 2024.1)。
*   **自動化建模**: 工具會自動處理 AEDB 檔案中材料、層、焊盤和過孔的建立。
*   **元件建立 (Component Creation)**: 根據命名慣例 (`component.pin`) 自動將過孔分組為元件，以便於在 Ansys 中整合。

## 先決條件

*   **Python**: 版本 3.10 或更高。
*   **Ansys AEDT**: 已安裝並授權 (建議版本 2024.1 或更新)。
*   **相依套件**:
    *   `pywebview`: 用於 GUI 視窗。
    *   `pyedb`: 用於與 Ansys EDB 互動。

## 安裝

1.  **執行安裝腳本**:
    雙擊 `install.bat` 或在命令列中執行：
    ```bash
    install.bat
    ```
    此腳本將設定虛擬環境並安裝所有必要的相依套件。

## 使用方法

1.  **啟動應用程式**:
    執行 `main.py` 腳本以啟動 GUI。
    ```bash
    python main.py
    ```

2.  **工作流程**:
    *   **堆疊分頁 (Stackup Tab)**: 定義電路板層。您可以載入 `stack.xml` 作為起點。
    *   **焊盤分頁 (Padstack Tab)**: 建立參考堆疊層的焊盤定義。
    *   **佈局分頁 (Placement Tab)**: 選擇焊盤並在畫布上放置實例。
    *   **模擬分頁 (Simulation Tab)**: 輸入所需的 AEDB 版本並點擊 **Export to AEDB**。

3.  **輸出**:
    工具將在同一目錄中生成專案的 `.json` 檔案和相應的 `.aedb` 資料夾。

## 專案結構

*   `main.py`: 應用程式進入點。初始化 `pywebview` 視窗。
*   `api.py`: 包含 `ViaWizardAPI` 類別，連接 JavaScript 前端和 Python 後端。
*   `modeling.py`: 從專案資料生成 Ansys EDB 核心邏輯。
*   `gui/`: 包含前端資產 (`index.html`, `app.js`, `style.css`)。
*   `stack.xml`: 預設堆疊設定檔。

## 授權

MIT License
