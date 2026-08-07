/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
export function GrokCardContent() {
  return <img src='/grok-mark.png' alt='Grok' />
}

export function CodexCliContent() {
  return (
    <>
      <div className='snowapi-terminal-toolbar'>
        <span className='snowapi-window-dots' aria-hidden='true'>
          <i />
          <i />
          <i />
        </span>
        <span>codex-cli</span>
        <span>~/snowapi</span>
      </div>

      <div className='snowapi-terminal-body'>
        <div className='snowapi-terminal-question'>
          <span className='snowapi-terminal-prompt'>›</span>
          <span className='snowapi-terminal-question-text'>
            如何接入一个新的模型？
          </span>
        </div>

        <div className='snowapi-terminal-thinking'>
          <span>thinking</span>
          <i aria-hidden='true' />
        </div>
        <p className='snowapi-terminal-step snowapi-terminal-step-one'>
          检查端点与认证方式
        </p>
        <p className='snowapi-terminal-step snowapi-terminal-step-two'>
          验证可用模型与请求格式
        </p>
        <p className='snowapi-terminal-step snowapi-terminal-step-three'>
          生成最小接入配置
        </p>

        <div className='snowapi-terminal-answer'>
          <span aria-hidden='true'>✓</span>
          <p>已生成接入方案：使用统一 Base URL 与 API Key 即可调用。</p>
        </div>
      </div>
    </>
  )
}

export function ConnectionCardContent() {
  return (
    <>
      <div className='snowapi-connection-heading'>
        <span>connection.setup</span>
        <i aria-hidden='true' />
      </div>

      <div className='snowapi-connection-fields'>
        <div className='snowapi-connection-field'>
          <span className='snowapi-connection-label'>Base URL</span>
          <span className='snowapi-connection-value snowapi-connection-base'>
            https://api.unsnow.org/v1
          </span>
        </div>

        <div className='snowapi-connection-field'>
          <span className='snowapi-connection-label'>API Key</span>
          <span className='snowapi-connection-value snowapi-connection-key'>
            sk-snowapi-••••••••••
          </span>
        </div>
      </div>

      <div className='snowapi-connection-progress'>
        <i aria-hidden='true' />
        <span>正在验证端点与凭证…</span>
      </div>

      <div className='snowapi-connection-success'>
        <i aria-hidden='true' />
        <div>
          <strong>连接成功</strong>
          <span>模型服务已就绪</span>
        </div>
      </div>
    </>
  )
}
