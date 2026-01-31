# Polymarket套利监控器

这个工具使用官方Polymarket Node.js SDK，实时监控市场中YES+NO<1的套利机会，并记录到CSV文件中。

## 功能特点

- 使用WebSocket实时接收价格更新
- 自动检测YES+NO价格总和小于1的套利机会
- 计算潜在利润（考虑交易费用）
- 检查最小流动性要求
- 将套利机会保存到CSV文件
- 彩色命令行输出，易于查看

## 配置参数

配置参数存储在`.env`文件中：

- `THRESHOLD` - 套利机会阈值，YES+NO小于此值时触发提醒（默认：0.99）
- `MIN_LIQUIDITY` - 最小流动性要求，USDC（默认：10.0）
- `ESTIMATED_FEE` - 估计的交易费率（默认：0.02，即2%）
- `CSV_PATH` - 套利机会记录的CSV文件路径（默认：./data/opportunities.csv）

## 运行方法

```bash
# 安装依赖
npm install

# 运行监控器
npm start
```

## 输出示例

```
===== 发现套利机会! =====
市场: Will BTC be above $75,000 on April 1st?
YES价格: 0.4800
NO价格: 0.4900
总价: 0.9700
潜在利润: 0.0300
最小流动性: 35.42 USDC
=========================
```

## CSV格式

监控器会将发现的套利机会保存到CSV文件中，包含以下字段：

- `TIMESTAMP` - 发现时间戳
- `MARKET_ID` - 市场ID
- `CONDITION_ID` - 条件ID
- `TITLE` - 市场标题
- `YES_PRICE` - YES代币价格
- `NO_PRICE` - NO代币价格
- `TOTAL_PRICE` - 总价（YES+NO）
- `POTENTIAL_PROFIT` - 潜在利润（考虑费用）
- `MIN_LIQUIDITY` - 最小流动性（USDC）
- `YES_TOKEN_ID` - YES代币ID
- `NO_TOKEN_ID` - NO代币ID