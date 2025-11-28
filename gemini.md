# Via Wizard

用來讀取AEDT stackup xml檔案，並找出via 最佳設計參數

## Usage
利用Pywebview 建立GUI介面，視窗 採Darkmode, 風格為簡約大方。 layout如下：
### 選單
有以下：Files, Options, Help,
- Files : Open Stackup XML, Save Project, Load Project, Exit
- Options : Hide/Show Message Window
- Help : User Manual, About


### 主Panel
當中有6個標籤頁
1. 用來檢視與設定stackup，可以從EXCEL複製matrix並貼上stackup table。
2. Padstack Design: 用來設定padstack設計參數
3. Placement Design: 用來設定via placement設計參數
4. Signal Design: 用來設定signal設計參數
5. Simulation Setup: 用來設定模擬參數
6. Design Optimization: 用來進行設計優化

### 訊息視窗
共享同一個訊息視窗，視窗border可以調整高度，用來顯示目前操作訊息，可以清除，關閉，匯出等等

## Tabs Content

### Stackup
#### mode
- load/new, input N to create new stackup with default values, dielectric - conductor - dielectric in sequence and dielectric in the end
- load xml, load stackup from xml file, @stack.xml
- when loading, the dk, df, conductivity are extracted from the xml and fill them into the table.

#### table labels and allowed values
- mil/mm toggle
- layername, type(conductor/dielectric), thickness, dk(dielectric constant), df(dielectric loss tangent), conductivity(conductor), fill_material(dielectric directly above/under conductor) and IsReference(True/False), IsReference exist only on conductor layers.
- allow copy from EXCEL and paste to stackup table
- Show the 2D section in correct scale on on the right of table.
- the setting can be write to xml file with the same schema as stackup.xml, if the dk and df does not exist, create <Material></Material> as shown in stackup.xml
- IsReference is added to the xml file.

### Placement Design Tab

#### left panel
- shows defined padstacks
- single/differential/gnd radio buttons
- if differential, shows pitch input field and horizontal/vertical radio buttons, it will group two vias as a pair for placement.


#### center panel
- grid layout, spacing is default 5mil, user can change it. the center is (0,0), x axis and y axis are thicker than others.
- user can zoom in/out, pan the canvas, a button to fit all in the canvas
- user can place single/differential vias (center of two vias position link line) on grid
- there are two arrows on single vias and can be dragged to point to N/W/W/S, one arrow is into via, the other is out of via
- there are two arrows on differential vias and can be dragged to rotate perpendicularly to the link line, one is into via, the other is out of via, the arrow has layer property to select the layer
- vias can be dragged to move on grids
- vias can be deleted
- vias can be selected and show the properties in the right property panel
- differential vias are labeled in different color two centric circles, the outside is the diameter of the via and the inside is the hole diameter.
- although placement is on grid with drag and drop, the via position can be fine tuned with input position field. the position of vias will be aligned to the input field. it means the vias can be off the grid

#### right panel
- placed single/differential instances panel above
- property panel of the selected via instance below
- change property of the selected via instance will update the via on the canvas





