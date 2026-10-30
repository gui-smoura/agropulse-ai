"""SQLAlchemy 2.0 ORM schema for AgroPulse AI (5 core tables)."""

from collections.abc import Generator
from datetime import date

from sqlalchemy import Date, Float, ForeignKey, Integer, String, create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import (
    DeclarativeBase,
    Mapped,
    Session,
    mapped_column,
    relationship,
    sessionmaker,
)

from app.config import get_settings


class Base(DeclarativeBase):
    """Base declarative class for SQLAlchemy 2.0 models."""


class Filial(Base):
    """Distribution branch table (`filiais`)."""

    __tablename__ = "filiais"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    cidade: Mapped[str] = mapped_column(String(100), nullable=False)
    microrregiao: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    consultores: Mapped[list["Consultor"]] = relationship(
        back_populates="filial", cascade="all, delete-orphan"
    )
    posicoes_estoque: Mapped[list["PosicaoEstoqueClima"]] = relationship(
        back_populates="filial", cascade="all, delete-orphan"
    )
    vendas: Mapped[list["RegistroVenda"]] = relationship(
        back_populates="filial", cascade="all, delete-orphan"
    )


class Consultor(Base):
    """Field sales consultant table (`consultores`)."""

    __tablename__ = "consultores"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(120), nullable=False)
    filial_id: Mapped[int] = mapped_column(
        ForeignKey("filiais.id", ondelete="CASCADE"), nullable=False, index=True
    )
    perfil_foco: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    filial: Mapped["Filial"] = relationship(back_populates="consultores")
    vendas: Mapped[list["RegistroVenda"]] = relationship(
        back_populates="consultor", cascade="all, delete-orphan"
    )


class Produto(Base):
    """Agricultural input product table (`produtos`)."""

    __tablename__ = "produtos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(140), nullable=False)
    categoria: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    janela_ideal_dias: Mapped[int] = mapped_column(Integer, nullable=False)
    preco_unitario: Mapped[float] = mapped_column(Float, nullable=False)
    margem_alvo_pct: Mapped[float] = mapped_column(Float, nullable=False)

    posicoes_estoque: Mapped[list["PosicaoEstoqueClima"]] = relationship(
        back_populates="produto", cascade="all, delete-orphan"
    )
    vendas: Mapped[list["RegistroVenda"]] = relationship(
        back_populates="produto", cascade="all, delete-orphan"
    )


class PosicaoEstoqueClima(Base):
    """Daily stock balance and precipitation telemetry (`posicao_estoque_clima`)."""

    __tablename__ = "posicao_estoque_clima"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    data: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    filial_id: Mapped[int] = mapped_column(
        ForeignKey("filiais.id", ondelete="CASCADE"), nullable=False, index=True
    )
    produto_id: Mapped[int] = mapped_column(
        ForeignKey("produtos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    entradas_qtd: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    saldo_disponivel_qtd: Mapped[float] = mapped_column(Float, nullable=False)
    precipitacao_mm: Mapped[float] = mapped_column(Float, nullable=False)

    filial: Mapped["Filial"] = relationship(back_populates="posicoes_estoque")
    produto: Mapped["Produto"] = relationship(back_populates="posicoes_estoque")


class RegistroVenda(Base):
    """Daily consultant sales transaction table (`registro_vendas`)."""

    __tablename__ = "registro_vendas"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    data: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    filial_id: Mapped[int] = mapped_column(
        ForeignKey("filiais.id", ondelete="CASCADE"), nullable=False, index=True
    )
    consultor_id: Mapped[int] = mapped_column(
        ForeignKey("consultores.id", ondelete="CASCADE"), nullable=False, index=True
    )
    produto_id: Mapped[int] = mapped_column(
        ForeignKey("produtos.id", ondelete="CASCADE"), nullable=False, index=True
    )
    quantidade_vendida: Mapped[float] = mapped_column(Float, nullable=False)
    margem_aplicada_pct: Mapped[float] = mapped_column(Float, nullable=False)

    filial: Mapped["Filial"] = relationship(back_populates="vendas")
    consultor: Mapped["Consultor"] = relationship(back_populates="vendas")
    produto: Mapped["Produto"] = relationship(back_populates="vendas")


def create_db_engine(database_url: str | None = None) -> Engine:
    """Create a SQLAlchemy Engine configured for SQLite or external DB."""
    url = database_url or get_settings().database_url
    connect_args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    return create_engine(url, connect_args=connect_args, future=True)


engine = create_db_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)


def init_db(target_engine: Engine | None = None) -> None:
    """Create all tables in the target database engine."""
    active_engine = target_engine or engine
    Base.metadata.create_all(bind=active_engine)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency yielding a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
