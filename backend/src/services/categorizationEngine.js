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
    'atm', 'cash withdrawal', 'self withdrawal',
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

function getAllCategories() {
  return Object.keys(CATEGORY_RULES);
}

module.exports = { categorizeTransaction, getAllCategories, CATEGORY_RULES };
