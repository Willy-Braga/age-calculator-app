const form = document.getElementById('date-form');

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const day = document.getElementById('day').value;
    const month = document.getElementById('month').value;
    const year = document.getElementById('year').value;

    const errorDay = document.getElementById('error-day');
    const errorMonth = document.getElementById('error-month');
    const errorYear = document.getElementById('error-year');

    let allFieldsEmpty = true;
    let isValid = true;

    const fields = [
        { value: day, errorElement: errorDay, message: 'Por favor, insira um dia' },
        { value: month, errorElement: errorMonth, message: 'Por favor, insira um mês' },
        { value: year, errorElement: errorYear, message: 'Por favor, insira um ano' },
    ];

    fields.forEach(field => {
        if (field.value === '') {
            field.errorElement.textContent = field.message;
            field.errorElement.classList.remove('error-disabled');
        } else {
            allFieldsEmpty = false; 
        }
    });

    if (allFieldsEmpty) {
        isValid = false;
        return; 
    }


    function isLeapYear(year) {
        return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
    }

    const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

    if (day < 1 || day > daysInMonth[month - 1]) {
        errorDay.textContent = `O mês ${month} não tem ${day} dias no ano de ${year}.`;
        errorDay.classList.remove('error-disabled');
        isValid = false;
    }

    const dayNumber = document.getElementById('dayNumber')
    const monthNumber = document.getElementById('monthNumber');
    const yearNumber = document.getElementById('yearNumber');

    const birthDate = `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;

    function calculateAge(birthDate) {
        let date = new Date();

        let years = date.getFullYear() - year;
        let months = date.getMonth() - month;
        let days = date.getDate() - day;

    
        if (months < 0 || (months === 0 && days < 0)) {
            years--; 
            months += 12;
        }

        if (days < 0) {
            const lastMonth = new Date(date.getFullYear(), date.getMonth(), 0); 
            days += lastMonth.getDate();
            months--; 
        }

        return { years, months, days };
    }

    const age = calculateAge(birthDate);

    if (isValid) {
        console.log(day, month, year);

        dayNumber.textContent = `${age.days}`;
        monthNumber.textContent = `${age.months}`;
        yearNumber.textContent = `${age.years}`;
    }

});

