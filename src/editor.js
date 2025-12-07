const widthInput = document.getElementById("widthInput");
const heightInput = document.getElementById("heightInput");
const submitButton = document.querySelector(".submit");
const popUpText = document.getElementById("popUpText");
const popUp = document.getElementById("popUp");
const colorPicker = document.getElementById("colorInput");
let height;
let width;
let color;
let selected;

//popUp.style.display = "none"; //temp

function select(element){
    element.style.color = "rgb(226, 174, 78)"
    if (selected !== undefined) selected.style.color = "black";
    selected = element;
}

submitButton.addEventListener("click", () => {
    width = parseInt(widthInput.value);
    height = parseInt(heightInput.value);

    if (width > 1920 || height > 1080) {
        popUpText.textContent = "Maximum size allowed is 1920x1080";
        popUpText.style.color = "rgb(240, 87, 87)";
    } else if (isNaN(width) || isNaN(height) || width < 1 || height < 1) {
        popUpText.textContent = "Please enter valid numbers";
        popUpText.style.color = "rgb(240, 87, 87)";
    } else {
        popUp.style.display = "none";
        console.log(`Width: ${width}, Height: ${height}`);
        renderPixelGrid();
    }
});

colorPicker.addEventListener("input", () => {
    color = colorPicker.value;
    console.log(`Selected color: ${color}`);
});

document.querySelectorAll(".borderLeft").forEach(element => {
    element.addEventListener("click", () => {
        select(element);
    });
});

function renderPixelGrid(){
    for (let j = 1; j < height + 1; j++) {
        for (let i = 1; i < width + 1; i++) {
            const div = document.createElement("div");
            const container = document.getElementById("container");
            div.style.height = window.innerHeight / 9 * 7 / height + "px";
            div.style.aspectRatio = "1 / 1";
            //div.style.border = "1px solid #ccc";
            div.id = `px${(j - 1) * width + i}`;
            div.className = "pixel";
            container.appendChild(div);
        }
    }
}



