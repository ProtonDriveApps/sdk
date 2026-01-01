pub enum Either<L, R> {
    Left(L),
    Right(R),
}

impl<L,R> Either<L,R> {
    pub fn value(&self) -> Result<&L, &R> {
        match self {
            Self::Left(t) => Ok(t),
            Self::Right(t) => Err(t),
        }
    }
}