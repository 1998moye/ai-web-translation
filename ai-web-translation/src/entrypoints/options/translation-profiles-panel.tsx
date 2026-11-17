export function TranslationProfilesPanel() {
  return (
    <div className="aiwt-panel">
      <section>
        <h2>翻译服务配置</h2>
        <p className="aiwt-hint">
          这个页签由「翻译服务配置与划词翻译」实现负责（工单 02–09）：创建命名配置、完整请求地址、API Key、模型、
          自定义请求头、额外请求参数、翻译提示词与连接测试。
        </p>
        <p className="aiwt-hint">
          当前构建不在这里保存密钥，也不会使用 fake Adapter 冒充真实翻译；生产装配在联调工单 19 接入。
        </p>
        <div className="aiwt-placeholder" role="note">
          尚未接入
        </div>
      </section>
    </div>
  );
}
