/**
 * Transaction Categorization Engine
 * Rule-based (primary) with extensible ML placeholder
 */

const CATEGORY_RULES = {
  'Food & Dining': [
    'swiggy', 'zomato', 'uber eats', 'dominos', 'domino', 'mcdonald', 'starbucks',
    'cafe', 'restaurant', 'pizza', 'burger', 'biryani', 'food', 'kitchen',
    'haldiram', 'barbeque', 'subway', 'kfc', 'chai', 'bakery', 'hotel',
    'eat', 'dine', 'meal', 'lunch', 'dinner', 'breakfast',
    'taco bell', 'wendy', 'dunkin', 'baskin', 'panda express',
    'freshmenu', 'box8', 'faasos', 'eatfit', 'behrouz', 'ovenstory',
    'burger king', 'chicking', 'paradise', 'saravana',
  ],
  'Transportation': [
    'uber', 'ola', 'rapido', 'petrol', 'diesel', 'hp pump', 'indian oil',
    'bharat petroleum', 'iocl', 'bpcl', 'hpcl', 'metro', 'irctc', 'railway',
    'redbus', 'makemytrip', 'yatra', 'goibibo', 'cleartrip', 'taxi', 'cab',
    'parking', 'toll', 'fastag',
  ],
  'Bills & Utilities': [
    'bescom', 'msedcl', 'electricity', 'electric', 'power', 'water', 'gas',
    'airtel', 'jio', 'vodafone', 'bsnl', 'vi ', 'broadband', 'wifi',
    'tata power', 'mahadiscom', 'torrent power', 'dth', 'tatasky', 'dish',
    'maintenance', 'society', 'municipal',
  ],
  'Shopping': [
    'amazon', 'flipkart', 'myntra', 'ajio', 'nykaa', 'meesho', 'snapdeal',
    'croma', 'reliance digital', 'vijay sales', 'dmart', 'big bazaar',
    'lifestyle', 'shoppers stop', 'westside', 'pantaloons', 'mall',
    'online shopping', 'retail',
    'nike', 'adidas', 'puma', 'zara', 'h&m', 'uniqlo', 'decathlon',
    'lenskart', 'boat', 'noise', 'samsung', 'apple store', 'mi store',
    'tata cliq', 'reliance trends',
  ],
  'Groceries': [
    'bigbasket', 'blinkit', 'zepto', 'instamart', 'jiomart', 'grofers',
    'nature basket', 'spencers', 'more supermarket', 'star bazaar',
    'grocery', 'supermarket', 'kirana', 'vegetables', 'fruits',
    'swiggy instamart', 'dunzo',
  ],
  'Entertainment': [
    'netflix', 'amazon prime', 'hotstar', 'disney', 'spotify', 'youtube',
    'bookmyshow', 'pvr', 'inox', 'cinepolis', 'movie', 'game', 'steam',
    'playstation', 'xbox', 'apple music', 'jiocinema', 'zee5', 'sonyliv',
  ],
  'Healthcare': [
    'apollo', 'fortis', 'medplus', 'netmeds', 'pharmeasy', 'hospital',
    'clinic', 'doctor', 'pharmacy', 'medical', 'health', 'diagnostic',
    'lab', 'pathology', 'dental', 'eye', 'optical',
    'practo', '1mg', 'tata 1mg',
  ],
  'Investments': [
    'zerodha', 'groww', 'upstox', 'paytm money', 'mutual fund', 'sip',
    'angel', 'share', 'stock', 'demat', 'nsdl', 'cdsl', 'cams',
    'kfintech', 'nippon', 'icici prudential mf', 'hdfc mf', 'sbi mf',
    'ppf', 'nps', 'fixed deposit', 'fd ',
  ],
  'Loan Payments': [
    'emi', 'home loan', 'car loan', 'personal loan', 'education loan',
    'loan repayment', 'instalment', 'installment', 'nach', 'ecs',
    'bajaj finserv', 'hdfc ltd', 'lic hfl',
  ],
  'Insurance': [
    'insurance', 'lic', 'hdfc life', 'icici pru', 'max life', 'sbi life',
    'star health', 'bajaj allianz', 'policy', 'premium',
    'general insurance', 'health insurance', 'term plan',
  ],
  'Education': [
    'school', 'college', 'university', 'tuition', 'coaching', 'course',
    'udemy', 'coursera', 'unacademy', 'byjus', 'vedantu', 'exam', 'book',
    'stationery', 'education',
  ],
  'Transfer': [
    'transfer', 'neft', 'rtgs', 'imps', 'self transfer', 'fund transfer',
    'own account',
  ],
  'Cash Withdrawal': [
    'atm', 'cash withdrawal', 'self withdrawal', 'atm withdrawal',
  ],
  'Salary': [
    'salary', 'payroll', 'stipend', 'wages',
  ],
  'Rent': [
    'rent', 'rental', 'lease', 'housing',
  ],
  'Personal Care': [
    'salon', 'spa', 'beauty', 'grooming', 'parlour', 'barber',
    'gym', 'fitness', 'cult fit', 'yoga',
  ],
  'Gifts & Donations': [
    'gift', 'donation', 'charity', 'ngo', 'temple', 'church', 'mosque',
  ],
};

function categorizeTransaction(merchant) {
  if (!merchant) return 'Uncategorized';
  const merchantLower = merchant.toLowerCase();

  // Rule-based matching
  for (const [category, keywords] of Object.entries(CATEGORY_RULES)) {
    if (keywords.some(keyword => merchantLower.includes(keyword))) {
      return category;
    }
  }

  return 'Uncategorized';
}

/**
 * Type-aware categorization: uses financial_type and instrument_type
 * before falling back to merchant-based keyword matching.
 */
function categorizeByType(financialType, instrumentType, merchant) {
  // Direct type-to-category mappings (override merchant-based)
  const typeMap = {
    investment: 'Investments',
    insurance_premium: 'Insurance',
    loan_emi: 'Loan Payments',
    salary: 'Salary',
    cashback: 'Shopping',  // cashback is typically shopping-related
    refund: 'Shopping',    // refunds are typically shopping-related
  };

  if (financialType && typeMap[financialType]) {
    return typeMap[financialType];
  }

  // For bill type, use instrument_type to refine
  if (financialType === 'bill') {
    const billInstrumentMap = {
      utility: 'Bills & Utilities',
      telecom: 'Bills & Utilities',
      insurance_policy: 'Insurance',
      subscription: 'Entertainment',
      loan_account: 'Loan Payments',
      credit_card: 'Bills & Utilities',
    };
    if (instrumentType && billInstrumentMap[instrumentType]) {
      return billInstrumentMap[instrumentType];
    }
    return 'Bills & Utilities';
  }

  // For transfer type
  if (financialType === 'transfer') {
    return 'Transfer';
  }

  // Fall back to merchant-based categorization
  return categorizeTransaction(merchant);
}

function getAllCategories() {
  return Object.keys(CATEGORY_RULES);
}

module.exports = { categorizeTransaction, categorizeByType, getAllCategories, CATEGORY_RULES };
