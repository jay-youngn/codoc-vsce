// 这是一个测试文件，用于测试不同的文档模板解析

// @summary(CLOUD-123) 购物车本地缓存方案
//  - context: 购物车数据需要在多个页面共享，且需要离线访问
//  - why: 为了提升用户体验，减少网络请求
//  - how: 使用 localStorage 缓存购物车数据，定时同步到服务器 (timeInterval)
//  - 试一下自定义的行
//  - 试一下自定义的行222
//  - req: CLOUD-123123
//  - domain: cart,storage
// @endSummary

/**
 * @decision 选择使用 RESTful API 而非 gRPC
 *  - req: CLOUD-166, CLOUD-1666
 *  - why: 因为 RESTful API 更易于开发和快速迭代，无需频繁更新客户端
 *  - how: 使用框架集成的 HTTP Client
 *  - risk: 暂无
 *  - domain: api,network
 * @endDecision
 *
 * HTTP Client
 *
 * @param {string} method
 * @param {string} url
 * @returns {Promise<string>}
 */
function request(method, url) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.onload = () => resolve(xhr.response);
    xhr.onerror = () => reject(new Error('Network Error'));
    xhr.send();
  });
}

/**
 * @summary(CLOUD-111) 订单处理服务
 *  - context: 订单计算和验证
 *  - why: 为了确保订单的有效性和准确性
 *  - how: 使用服务类封装订单处理逻辑
 *    * test1
 *    * test1999
 *  - req: CLOUD-222
 *  - domain: order,validation
 * @endSummary
 */
const OrderService = {
  /**
   * 处理订单计算和验证
   */
  processOrder: function (order, user) {
    // 验证订单
    if (!this.validateOrder(order)) {
      return { success: false, error: 'INVALID_ORDER' };
    }

    // 验证库存
    const stockCheck = this.checkStock(order.items);
    if (!stockCheck.available) {
      return {
        success: false,
        error: 'OUT_OF_STOCK',
        items: stockCheck.unavailableItems
      };
    }

    // 计算价格
    const pricing = this.calculatePricing(order, user);

    // 创建最终订单
    return {
      success: true,
      orderNumber: this.generateOrderNumber(),
      totalPrice: pricing.total,
      items: order.items,
      taxes: pricing.taxes,
      shipping: pricing.shipping,
      discounts: pricing.discounts
    };
  },

  validateOrder: function (order) {
    return order &&
      order.items &&
      order.items.length > 0 &&
      order.shippingAddress;
  },

  checkStock: function (items) {
    // 模拟库存检查
    const unavailableItems = [];

    for (const item of items) {
      // 检查库存逻辑...
    }

    return {
      available: unavailableItems.length === 0,
      unavailableItems
    };
  },

  calculatePricing: function (order, user) {
    // 复杂的价格计算逻辑...
    return {
      subtotal: 0,
      taxes: 0,
      shipping: 0,
      discounts: [],
      total: 0
    };
  },

  generateOrderNumber: function () {
    // @decision 暂时使用时间戳作为订单号
    //  - req: CLOUD-111
    //  - why: 为了快速生成唯一订单号，业务方对长度无强制要求
    //  - how: 使用时间戳和随机数生成
    // @endDecision
    return 'ORD-' + Date.now() + '-' +
      Math.floor(Math.random() * 1000);
  }
};

// @fix(BUG-456) 修复订单金额计算错误
//  - why: 当订单包含多种折扣类型时，计算顺序错误导致最终价格不准确
//  - how: 修改折扣计算顺序，先应用固定金额折扣，再应用百分比折扣
//  - risk: 可能影响历史订单数据的一致性
//  - req: CLOUD-789, CLOUD-321
//  - domain: order,payment
// @endFix

// 修复后的折扣计算函数
function calculateOrderTotal(items, discounts) {
  // 计算商品小计
  let subtotal = items.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  // 按类型分组折扣
  const fixedDiscounts = discounts.filter(d => d.type === 'fixed');
  const percentDiscounts = discounts.filter(d => d.type === 'percent');

  // 先应用固定金额折扣
  let discountTotal = 0;
  fixedDiscounts.forEach(discount => {
    discountTotal += discount.value;
  });

  // 应用固定折扣后的小计
  let afterFixedDiscount = Math.max(0, subtotal - discountTotal);

  // 再应用百分比折扣
  percentDiscounts.forEach(discount => {
    afterFixedDiscount *= (1 - discount.value / 100);
  });

  // 四舍五入到两位小数
  return Math.round(afterFixedDiscount * 100) / 100;
}

// 用户认证服务
class AuthService {
  // @testFocus 验证用户登录逻辑处理
  //  - req: CLOUD-101, CLOUD-102
  //  - usecase: 验证用户多次输入错误密码时的账户锁定机制
  //  - businessRule:
  //    - 用户连续输入错误密码超过 5 次，账户将被锁定 30 分钟
  //    - 锁定期间，用户无法登录
  //    - 登录成功后，锁定时间将重置
  //  - checkMethod: 使用自动化测试模拟连续登录失败场景
  //    sdafasd
  //    ```bash
  //    # 试一下markdow嵌套
  //    node --version
  //    ```
  //  - risk: 锁定机制可能影响合法用户的登录体验
  //  - 其他自定义内容: 111
  //  - domain: user,security
  // @endTestFocus
  constructor(userRepo, configService) {
    this.userRepo = userRepo;
    this.maxAttempts = configService.get('security.maxLoginAttempts') || 5;
    this.lockDuration = configService.get('security.lockDurationMinutes') || 30;
    this.attemptCache = new Map(); // 用户名 -> {attempts, lastAttempt}
  }

  /**
   * 用户登录认证
   * @param {string} username 用户名
   * @param {string} password 密码
   * @returns {Object} 登录结果
   */
  async login(username, password) {
    // 检查账户是否被锁定
    if (this.isAccountLocked(username)) {
      return {
        success: false,
        message: 'ACCOUNT_LOCKED',
        remainingTime: this.getLockRemainingTime(username)
      };
    }

    // 获取用户信息
    const user = await this.userRepo.findByUsername(username);
    if (!user) {
      return {
        success: false,
        message: 'USER_NOT_FOUND'
      };
    }

    // 验证密码
    const passwordValid = await this.verifyPassword(password, user.passwordHash);
    if (passwordValid) {
      // 重置尝试记录
      this.resetAttempts(username);
      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          roles: user.roles
        }
      };
    } else {
      // 增加失败尝试次数
      this.incrementAttempts(username);

      // 判断是否应该锁定账户
      const attempts = this.getAttempts(username);
      if (attempts >= this.maxAttempts) {
        return {
          success: false,
          message: 'ACCOUNT_LOCKED',
          remainingTime: this.lockDuration * 60
        };
      }

      return {
        success: false,
        message: 'INVALID_CREDENTIALS',
        remainingAttempts: this.maxAttempts - attempts
      };
    }
  }

  /**
   * 检查账户是否被锁定
   */
  isAccountLocked(username) {
    const data = this.attemptCache.get(username);
    if (!data) return false;

    // @feature 密码验证失败并且尝试多次时，判断锁定
    //  - req: REQ-999
    // @endFeature

    if (data.attempts >= this.maxAttempts) {
      const lockTime = data.lastAttempt;
      const lockExpiryTime = lockTime + (this.lockDuration * 60 * 1000);
      const now = Date.now();

      if (now < lockExpiryTime) {
        return true;
      } else {
        // 锁定时间已过
        this.resetAttempts(username);
        return false;
      }
    }

    return false;
  }

  /**
   * @fix(BUG-111) 账户锁定剩余时间计数问题
   *  - why: 需要确保锁定时间在用户解锁后能够正确释放
   *  - how: 添加逻辑以处理锁定时间的释放
   *  - req: CLOUD-789,CLOUD-321
   *  - domain: user,security
   * @endFix
   *
   * 获取账户锁定剩余时间（秒）
   * @returns {number} 剩余锁定时间（秒）
   */
  getLockRemainingTime(username) {
    const data = this.attemptCache.get(username);
    if (!data) return 0;

    const lockExpiryTime = data.lastAttempt + (this.lockDuration * 60 * 1000);
    const remainingMs = lockExpiryTime - Date.now();
    return Math.max(0, Math.floor(remainingMs / 1000));
  }

  /**
   * 获取当前尝试次数
   */
  getAttempts(username) {
    const data = this.attemptCache.get(username);
    return data ? data.attempts : 0;
  }

  /**
   * 增加失败尝试次数
   */
  incrementAttempts(username) {
    const data = this.attemptCache.get(username) || { attempts: 0 };
    data.attempts += 1;
    data.lastAttempt = Date.now();
    this.attemptCache.set(username, data);
  }

  /**
   * 重置尝试次数
   */
  resetAttempts(username) {
    this.attemptCache.delete(username);
  }

  /**
   * 验证密码
   */
  async verifyPassword(password, passwordHash) {
    // 密码验证逻辑...
    return password === 'correct_password'; // 示例
  }
}
