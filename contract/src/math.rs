//! Fixed-point helpers. All amounts are u128; intermediate products use 256 bits.

uint::construct_uint! {
    pub struct U256(4);
}

/// a * b / c, rounded down, without intermediate overflow.
pub fn mul_div(a: u128, b: u128, c: u128) -> u128 {
    assert!(c != 0, "division by zero");
    (U256::from(a) * U256::from(b) / U256::from(c)).as_u128()
}

/// Constant-product swap with no pool fee (the game's fee is charged separately).
pub fn swap_out(reserve_in: u128, reserve_out: u128, amount_in: u128) -> u128 {
    if amount_in == 0 || reserve_in == 0 || reserve_out == 0 {
        return 0;
    }
    mul_div(reserve_out, amount_in, reserve_in + amount_in)
}
