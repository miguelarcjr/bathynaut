import fs from 'node:fs';
import path from 'node:path';

const RULES_CONTENT = [
  '<!-- BATHYNAUT:START -->',
  '# Protocolo de Navegacao Oceanica Bathynaut (3-Phase Protocol)',
  '',
  'Este projeto utiliza o **Bathynaut** como harness cognitivo de memoria profunda e sonar de codigo.',
  '',
  '### Regras Obrigatorias do Agente:',
  '1. **Fase 1: Radar Pre-Edicao (Sonar)**: Antes de propor qualquer alteracao em arquivos de codigo, chame a ferramenta `bathynaut_sonar({ files: [...] })`.',
  '   - Inspecione os callers afetados (blast radius), fluxos de execucao e os testes de cobertura downstream.',
  '   - Respeite categoricamente os **blocking_invariants**, **ADRs ativas** e **incidentes conhecidos** retornados no payload.',
  '2. **Fase 2: Execucao Sem Regressao**: Nunca refatore codigo que viole os invariantes resgatados no Sonar.',
  '3. **Fase 3: Persistencia e Checkpoint**:',
  '   - Se uma nova decisao tecnica, padrao ou incidente foi registrado, salve-o chamando `bathynaut_log_adr`.',
  '   - Antes de encerrar qualquer turno de trabalho, execute `bathynaut_checkpoint` para salvar o estado mental ativo.',
  '<!-- BATHYNAUT:END -->'
].join('\n');

function backupFileIfExists(filePath: string, projectRoot?: string): void {
  if (!fs.existsSync(filePath)) return;
  try {
    const root = projectRoot || path.dirname(filePath);
    const backupDir = path.join(root, '.bathynaut', 'backups');
    fs.mkdirSync(backupDir, { recursive: true });
    const safeName = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '_');
    const backupPath = path.join(backupDir, `${safeName}.bak`);
    if (!fs.existsSync(backupPath)) {
      fs.copyFileSync(filePath, backupPath);
    }
  } catch {}
}

export function injectRulesFile(filePath: string, projectRoot?: string): boolean {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let existing = '';
    if (fs.existsSync(filePath)) {
      backupFileIfExists(filePath, projectRoot);
      existing = fs.readFileSync(filePath, 'utf-8');
    }

    if (existing.includes('<!-- BATHYNAUT:START -->')) {
      const updated = existing.replace(
        /<!-- BATHYNAUT:START -->[\s\S]*?<!-- BATHYNAUT:END -->/g,
        RULES_CONTENT.trim()
      );
      fs.writeFileSync(filePath, updated, 'utf-8');
    } else {
      const updated = existing ? `${existing.trim()}\n\n${RULES_CONTENT.trim()}\n` : `${RULES_CONTENT.trim()}\n`;
      fs.writeFileSync(filePath, updated, 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

export function removeRulesFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const existing = fs.readFileSync(filePath, 'utf-8');
    if (!existing.includes('<!-- BATHYNAUT:START -->')) return false;

    const cleaned = existing
      .replace(/\n*<!-- BATHYNAUT:START -->[\s\S]*?<!-- BATHYNAUT:END -->\n*/g, '\n')
      .trim();

    if (cleaned.length === 0) {
      fs.unlinkSync(filePath);
    } else {
      fs.writeFileSync(filePath, `${cleaned}\n`, 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

export function injectMCPConfig(configPath: string, serverBinPath: string, projectRoot?: string): boolean {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let config: any = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      backupFileIfExists(configPath, projectRoot);
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      } catch {
        config = { mcpServers: {} };
      }
    }

    if (!config.mcpServers) config.mcpServers = {};

    config.mcpServers['bathynaut'] = {
      command: 'node',
      args: [serverBinPath, 'serve']
    };

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return true;
  } catch {
    return false;
  }
}

export function removeMCPConfig(configPath: string): boolean {
  try {
    if (!fs.existsSync(configPath)) return false;
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    if (config?.mcpServers?.bathynaut) {
      delete config.mcpServers.bathynaut;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
