# SpineViewer

在浏览器里打开 Spine 骨骼，播放动画，并导出当前画面或 GIF。

支持 Spine 4.0、4.1、4.2、4.3 导出的 JSON。把 JSON、atlas 和贴图放在一起，拖进页面，或用「打开文件」「打开文件夹」。二进制 `.skel` 会按文件头里的版本选择对应播放器。

播放器来自 Esoteric Software 的 Spine Runtimes，许可见 `vendor/SPINE-RUNTIMES-LICENSE.txt`。直接双击 `index.html` 即可使用，文件都在本地读取，不会上传。

- 空格播放或暂停，左右方向键逐帧。
- 皮肤页可叠加 default 以外的皮肤。插槽前的勾选用来隐藏部件。
- 「导出 PNG」保存当前画面。「导出 GIF」按右侧帧率采样整段动画，最长边约 480 像素。
- 棋盘背景导出的 PNG 是透明的。GIF 会带上当前背景。

3.8 及更早的 JSON 与 4.x 运行时不兼容，这个页面打不开它们。
